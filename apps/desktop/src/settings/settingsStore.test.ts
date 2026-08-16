import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSettingsStore, type SettingsStoreGateway } from "./settingsStore";
import { appSettingsRegistry } from "./settingsStore";
import { resolveEffectiveValue } from "./settingsHelpers";
import { extractDefaults, type SettingDefinition } from "@thinkbrain/core";

/**
 * Creates a mock gateway with controllable app/workspace settings payloads.
 *
 * The `writeAppSettings` / `writeWorkspaceSettings` mocks capture the serialized
 * content so tests can assert what was persisted. Defaults to returning null
 * (no settings file) unless overridden.
 */
function createMockGateway(
  appSettings: string | null = null,
  workspaceSettings: string | null = null
): SettingsStoreGateway & {
  writtenAppSettings: string[];
  writtenWorkspaceSettings: { rootPath: string; contents: string }[];
  /**
   * Simulates another writer — `update_desktop_state`, `update_app_theme`, or
   * another window's save — landing on the app-settings document outside this
   * store's knowledge, the way a tab open or panel resize does in production.
   */
  setAppDocument(contents: string | null): void;
} {
  const writtenAppSettings: string[] = [];
  const writtenWorkspaceSettings: { rootPath: string; contents: string }[] = [];
  // Stand-ins for the files, so `revise` sees what the last write left there.
  let appDocument = appSettings;
  let workspaceDocument = workspaceSettings;

  return {
    readAppSettings: vi.fn(async () => appDocument),
    writeAppSettings: vi.fn(async (revise: (current: string | null) => string) => {
      const contents = revise(appDocument);
      appDocument = contents;
      writtenAppSettings.push(contents);
      return contents;
    }),
    readWorkspaceSettings: vi.fn(async () => workspaceDocument),
    writeWorkspaceSettings: vi.fn(
      async (rootPath: string, revise: (current: string | null) => string) => {
        const contents = revise(workspaceDocument);
        workspaceDocument = contents;
        writtenWorkspaceSettings.push({ rootPath, contents });
        return contents;
      }
    ),
    setAppDocument: (contents: string | null) => {
      appDocument = contents;
    },
    writtenAppSettings,
    writtenWorkspaceSettings
  };
}

/** App settings JSON with a desktopState nested key (must be preserved). */
const APP_JSON_WITH_DESKTOP_STATE = JSON.stringify({
  version: 1,
  "appearance.theme": "dark",
  "editor.fontSize": 20,
  "editor.lineWrapping": false,
  desktopState: {
    version: 3,
    lastWorkspacePath: "/notes/test",
    explorerOpen: true,
    leftPanelWidth: 288,
    rightPanelWidth: 320,
    bottomPanelOpen: false
  }
});

describe("settingsStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("loadSettings", () => {
    it("populates appValues from gateway + defaults merge; workspaceValues null when rootPath null", async () => {
      const gateway = createMockGateway(APP_JSON_WITH_DESKTOP_STATE);
      const store = createSettingsStore(gateway);

      await store.getState().loadSettings(null);

      const state = store.getState();
      expect(state.loaded).toBe(true);
      expect(state.loadError).toBeNull();
      // Persisted values override defaults.
      expect(state.appValues["appearance.theme"]).toBe("dark");
      expect(state.appValues["editor.fontSize"]).toBe(20);
      expect(state.appValues["editor.lineWrapping"]).toBe(false);
      // No workspace loaded.
      expect(state.workspaceValues).toBeNull();
      expect(state.workspaceRootPath).toBeNull();
      // Staged changes cleared.
      expect(state.stagedChanges).toEqual({});
      expect(state.isDirty).toBe(false);
    });

    it("fills missing keys with registry defaults", async () => {
      // Only theme is present; fontSize and lineWrapping should get defaults.
      const gateway = createMockGateway(
        JSON.stringify({ version: 1, "appearance.theme": "light" })
      );
      const store = createSettingsStore(gateway);

      await store.getState().loadSettings(null);

      const state = store.getState();
      expect(state.appValues["appearance.theme"]).toBe("light");
      expect(state.appValues["editor.fontSize"]).toBe(16);
      expect(state.appValues["editor.lineWrapping"]).toBe(true);
    });

    it("uses all defaults when settings file is null", async () => {
      const gateway = createMockGateway(null);
      const store = createSettingsStore(gateway);

      await store.getState().loadSettings(null);

      const defaults = extractDefaults(appSettingsRegistry, "app");
      expect(store.getState().appValues).toEqual(defaults);
    });

    it("populates workspaceValues when rootPath is given", async () => {
      const gateway = createMockGateway(
        APP_JSON_WITH_DESKTOP_STATE,
        JSON.stringify({ version: 1 })
      );
      const store = createSettingsStore(gateway);

      await store.getState().loadSettings("/notes/test");

      const state = store.getState();
      expect(state.workspaceValues).not.toBeNull();
      expect(state.workspaceRootPath).toBe("/notes/test");
      expect(gateway.readWorkspaceSettings).toHaveBeenCalledWith("/notes/test");
    });

    it("sets loadError on gateway failure", async () => {
      const gateway = createMockGateway(null);
      gateway.readAppSettings = vi.fn(async () => {
        throw new Error("disk read failed");
      });
      const store = createSettingsStore(gateway);

      await store.getState().loadSettings(null);

      const state = store.getState();
      expect(state.loaded).toBe(true);
      expect(state.loadError).toContain("disk read failed");
    });
  });

  describe("stageChange", () => {
    it("updates stagedChanges, isDirty true, dirtyCount", async () => {
      const gateway = createMockGateway(null);
      const store = createSettingsStore(gateway);
      await store.getState().loadSettings(null);

      store.getState().stageChange("appearance.theme", "dark");

      const state = store.getState();
      expect(state.stagedChanges["appearance.theme"]).toBe("dark");
      expect(state.isDirty).toBe(true);
      expect(state.dirtyCount).toBe(1);
    });

    it("clears validation diagnostics for the changed key", async () => {
      const gateway = createMockGateway(null);
      const store = createSettingsStore(gateway);
      await store.getState().loadSettings(null);

      // Manually inject a diagnostic to simulate a prior validation failure.
      store.setState({
        validationDiagnostics: [
          { code: "test", message: "bad", severity: "error", path: "appearance.theme" }
        ]
      });

      store.getState().stageChange("appearance.theme", "light");

      expect(store.getState().validationDiagnostics).toEqual([]);
    });
  });

  describe("saveSettings success", () => {
    it("validates, writes app settings via gateway, clears staged, updates appValues", async () => {
      const gateway = createMockGateway(APP_JSON_WITH_DESKTOP_STATE);
      const store = createSettingsStore(gateway);
      await store.getState().loadSettings(null);

      store.getState().stageChange("appearance.theme", "light");
      const result = await store.getState().saveSettings();

      expect(result.success).toBe(true);
      expect(result.diagnostics).toEqual([]);

      const state = store.getState();
      // appValues updated with staged value.
      expect(state.appValues["appearance.theme"]).toBe("light");
      // Staged cleared.
      expect(state.stagedChanges).toEqual({});
      expect(state.isDirty).toBe(false);
      // Gateway write called.
      expect(gateway.writeAppSettings).toHaveBeenCalledTimes(1);
      // desktopState preserved in the written JSON.
      const written = JSON.parse(gateway.writtenAppSettings[0] as string);
      expect(written["appearance.theme"]).toBe("light");
      expect(written.desktopState).toBeDefined();
      expect(written.desktopState.lastWorkspacePath).toBe("/notes/test");
      expect(written.version).toBe(1);
    });

    it("does not write when there are no staged changes", async () => {
      const gateway = createMockGateway(APP_JSON_WITH_DESKTOP_STATE);
      const store = createSettingsStore(gateway);
      await store.getState().loadSettings(null);

      const result = await store.getState().saveSettings();

      expect(result.success).toBe(true);
      expect(gateway.writeAppSettings).not.toHaveBeenCalled();
    });

    /**
     * The bug this pins: `rawAppSettingsJson` is a load-time snapshot.
     * `update_desktop_state` writes to the same document on every tab open,
     * panel resize, or workspace switch — all of which happen after load and
     * before the user presses Save. A save that serializes against the
     * snapshot instead of the document as it is right now reverts every one of
     * those changes.
     */
    it("does not revert desktopState written since the store loaded", async () => {
      const gateway = createMockGateway(APP_JSON_WITH_DESKTOP_STATE);
      const store = createSettingsStore(gateway);
      await store.getState().loadSettings(null);

      // A tab opened after load, via `update_desktop_state` — not through this
      // store, so `rawAppSettingsJson` never saw it.
      gateway.setAppDocument(
        JSON.stringify({
          version: 1,
          "appearance.theme": "dark",
          "editor.fontSize": 20,
          "editor.lineWrapping": false,
          desktopState: {
            version: 4,
            lastWorkspacePath: "/notes/test",
            explorerOpen: true,
            leftPanelWidth: 288,
            rightPanelWidth: 320,
            bottomPanelOpen: false,
            openTabs: [{ id: "a", title: "A", kind: "editor" }],
            activeTabId: "a"
          }
        })
      );

      store.getState().stageChange("appearance.theme", "light");
      const result = await store.getState().saveSettings();

      expect(result.success).toBe(true);
      const written = JSON.parse(gateway.writtenAppSettings.at(-1) as string);
      expect(written.desktopState.openTabs).toEqual([{ id: "a", title: "A", kind: "editor" }]);
      expect(written.desktopState.activeTabId).toBe("a");
    });
  });

  describe("saveSettings validation failure", () => {
    it("returns diagnostics, does NOT write, keeps staged", async () => {
      const gateway = createMockGateway(null);
      const store = createSettingsStore(gateway);
      await store.getState().loadSettings(null);

      // Stage an invalid value (fontSize out of range).
      store.getState().stageChange("editor.fontSize", 999);
      const result = await store.getState().saveSettings();

      expect(result.success).toBe(false);
      expect(result.diagnostics.length).toBeGreaterThan(0);

      const state = store.getState();
      // Staged changes preserved (not cleared).
      expect(state.stagedChanges["editor.fontSize"]).toBe(999);
      // Diagnostics stored.
      expect(state.validationDiagnostics.length).toBeGreaterThan(0);
      // Gateway NOT called.
      expect(gateway.writeAppSettings).not.toHaveBeenCalled();
    });
  });

  describe("stageChange autosave", () => {
    it("triggers a debounced save when settings.autosave is enabled", async () => {
      // Use fake timers so we can control the 300ms debounce window.
      vi.useFakeTimers();
      try {
        const gateway = createMockGateway(null);
        const store = createSettingsStore(gateway);
        await store.getState().loadSettings(null);

        // Enable autosave in appValues so stageChange sees the effective flag.
        store.setState({
          appValues: {
            ...store.getState().appValues,
            "settings.autosave": true
          }
        });

        // Stage a change — should schedule (not immediately call) a write.
        store.getState().stageChange("appearance.theme", "dark");
        expect(gateway.writeAppSettings).not.toHaveBeenCalled();

        // Advance past the debounce window; the autosave write should fire once.
        await vi.advanceTimersByTimeAsync(300);
        expect(gateway.writeAppSettings).toHaveBeenCalledTimes(1);

        // The staged change should be cleared after the successful save.
        expect(store.getState().stagedChanges).toEqual({});
        expect(store.getState().appValues["appearance.theme"]).toBe("dark");
      } finally {
        vi.useRealTimers();
      }
    });

    it("does NOT schedule a save when autosave is disabled (default)", async () => {
      vi.useFakeTimers();
      try {
        const gateway = createMockGateway(null);
        const store = createSettingsStore(gateway);
        await store.getState().loadSettings(null);

        // autosave defaults to false — no override.
        store.getState().stageChange("appearance.theme", "dark");
        await vi.advanceTimersByTimeAsync(300);

        expect(gateway.writeAppSettings).not.toHaveBeenCalled();
        expect(store.getState().isDirty).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it("coalesces rapid edits into a single save", async () => {
      vi.useFakeTimers();
      try {
        const gateway = createMockGateway(null);
        const store = createSettingsStore(gateway);
        await store.getState().loadSettings(null);
        store.setState({
          appValues: {
            ...store.getState().appValues,
            "settings.autosave": true
          }
        });

        // Three rapid edits within the debounce window.
        store.getState().stageChange("appearance.theme", "dark");
        await vi.advanceTimersByTimeAsync(100);
        store.getState().stageChange("editor.fontSize", 20);
        await vi.advanceTimersByTimeAsync(100);
        store.getState().stageChange("editor.lineWrapping", false);
        await vi.advanceTimersByTimeAsync(100);
        expect(gateway.writeAppSettings).not.toHaveBeenCalled();

        // Cross the debounce threshold — exactly one save fires with all three
        // staged values persisted together.
        await vi.advanceTimersByTimeAsync(300);
        expect(gateway.writeAppSettings).toHaveBeenCalledTimes(1);
        const written = JSON.parse(gateway.writtenAppSettings[0] as string);
        expect(written["appearance.theme"]).toBe("dark");
        expect(written["editor.fontSize"]).toBe(20);
        expect(written["editor.lineWrapping"]).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it("a just-staged autosave toggle itself triggers autosave", async () => {
      vi.useFakeTimers();
      try {
        const gateway = createMockGateway(null);
        const store = createSettingsStore(gateway);
        await store.getState().loadSettings(null);

        // Toggle autosave on via stageChange. The effective-value check inside
        // stageChange special-cases `settings.autosave` so the new value (true)
        // is seen immediately, scheduling a save for its own enablement.
        store.getState().stageChange("settings.autosave", true);
        expect(gateway.writeAppSettings).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(300);
        expect(gateway.writeAppSettings).toHaveBeenCalledTimes(1);
        const written = JSON.parse(gateway.writtenAppSettings[0] as string);
        expect(written["settings.autosave"]).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("resetStaged", () => {
    it("clears all staged changes", async () => {
      const gateway = createMockGateway(null);
      const store = createSettingsStore(gateway);
      await store.getState().loadSettings(null);

      store.getState().stageChange("appearance.theme", "dark");
      store.getState().stageChange("editor.fontSize", 20);
      store.getState().resetStaged();

      const state = store.getState();
      expect(state.stagedChanges).toEqual({});
      expect(state.isDirty).toBe(false);
      expect(state.dirtyCount).toBe(0);
      expect(state.validationDiagnostics).toEqual([]);
    });
  });

  describe("resetSection", () => {
    it("clears only that section's staged keys", async () => {
      const gateway = createMockGateway(null);
      const store = createSettingsStore(gateway);
      await store.getState().loadSettings(null);

      // Stage changes in two different sections.
      store.getState().stageChange("appearance.theme", "dark"); // section: appearance.theme
      store.getState().stageChange("editor.fontSize", 20); // section: editor.display
      store.getState().stageChange("editor.lineWrapping", false); // section: editor.display

      // Reset only the editor.display section.
      store.getState().resetSection("editor.display");

      const state = store.getState();
      expect(state.stagedChanges["appearance.theme"]).toBe("dark");
      expect(state.stagedChanges["editor.fontSize"]).toBeUndefined();
      expect(state.stagedChanges["editor.lineWrapping"]).toBeUndefined();
      expect(state.dirtyCount).toBe(1);
    });
  });

  describe("setActiveSection / setSearchQuery", () => {
    it("sets the active section", async () => {
      const gateway = createMockGateway(null);
      const store = createSettingsStore(gateway);

      store.getState().setActiveSection("editor.display");
      expect(store.getState().activeSection).toBe("editor.display");

      store.getState().setActiveSection(null);
      expect(store.getState().activeSection).toBeNull();
    });

    it("sets the search query", async () => {
      const gateway = createMockGateway(null);
      const store = createSettingsStore(gateway);

      store.getState().setSearchQuery("font");
      expect(store.getState().searchQuery).toBe("font");
    });
  });

  describe("getEffectiveValue", () => {
    it("returns staged > loaded > default", async () => {
      const gateway = createMockGateway(
        JSON.stringify({ version: 1, "appearance.theme": "light" })
      );
      const store = createSettingsStore(gateway);
      await store.getState().loadSettings(null);

      // Loaded value (light) > default (system).
      expect(store.getState().getEffectiveValue("appearance.theme")).toBe("light");

      // Staged value overrides loaded.
      store.getState().stageChange("appearance.theme", "dark");
      expect(store.getState().getEffectiveValue("appearance.theme")).toBe("dark");

      // Default for a key not in loaded or staged.
      expect(store.getState().getEffectiveValue("editor.fontSize")).toBe(16);
    });

    // Falsy values must NOT be replaced by a lower-precedence layer. Each layer
    // is checked by key presence (`in`), not truthiness, so a staged `false` is
    // not silently dropped in favor of a saved `true`. These tests pin that
    // behavior through the store action (which delegates to the shared
    // `resolveEffectiveValue` helper).
    it("keeps a staged falsy value over a saved truthy one", async () => {
      const gateway = createMockGateway(
        JSON.stringify({
          version: 1,
          "editor.lineWrapping": true,
          "editor.fontSize": 24,
          "appearance.theme": "dark"
        })
      );
      const store = createSettingsStore(gateway);
      await store.getState().loadSettings(null);

      store.getState().stageChange("editor.lineWrapping", false);
      expect(store.getState().getEffectiveValue("editor.lineWrapping")).toBe(false);

      store.getState().stageChange("editor.fontSize", 0);
      expect(store.getState().getEffectiveValue("editor.fontSize")).toBe(0);

      store.getState().stageChange("appearance.theme", "");
      expect(store.getState().getEffectiveValue("appearance.theme")).toBe("");
    });

    it("keeps a loaded falsy value over the default", async () => {
      // The app settings file explicitly stores falsy values; they must win
      // over the registry default rather than being treated as "missing".
      const gateway = createMockGateway(
        JSON.stringify({
          version: 1,
          "editor.lineWrapping": false,
          "editor.fontSize": 0
        })
      );
      const store = createSettingsStore(gateway);
      await store.getState().loadSettings(null);

      expect(store.getState().getEffectiveValue("editor.lineWrapping")).toBe(false);
      expect(store.getState().getEffectiveValue("editor.fontSize")).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// resolveEffectiveValue: pure table tests.
//
// The store action delegates to this helper, and the settings UI calls it
// directly during render, so both consumers share one precedence definition.
// These table tests pin every precedence layer, falsy-value handling, and the
// "unknown key" / "no definition" edge cases so a future change to the helper
// cannot silently drift the UI away from the store.
// ---------------------------------------------------------------------------
describe("resolveEffectiveValue", () => {
  // A workspace-scoped definition (so the workspace layer is consulted) and an
  // app-scoped definition (so it is not), plus an unknown key sentinel.
  const workspaceDef: SettingDefinition = {
    key: "root",
    type: "string",
    label: "Root",
    description: "",
    default: "default-ws",
    scope: "workspace",
    section: "fixture.main"
  };
  const booleanWorkspaceDef: Extract<SettingDefinition, { type: "boolean" }> = {
    key: "root",
    type: "boolean",
    label: "Root",
    description: "",
    default: false,
    scope: "workspace",
    section: "fixture.main"
  };
  const appDef: SettingDefinition = {
    key: "view",
    type: "string",
    label: "View",
    description: "",
    default: "default-app",
    scope: "app",
    section: "fixture.main"
  };

  type Case = {
    readonly name: string;
    readonly key: string;
    readonly staged: Record<string, unknown>;
    readonly app: Record<string, unknown>;
    readonly workspace: Record<string, unknown> | null;
    readonly def: SettingDefinition | undefined;
    readonly expected: unknown;
  };

  const cases: readonly Case[] = [
    // --- Precedence: staged > workspace > app > default ---
    {
      name: "staged wins over workspace, app, and default (workspace-scoped)",
      key: "fixture.root",
      staged: { "fixture.root": "staged" },
      app: { "fixture.root": "app" },
      workspace: { "fixture.root": "ws" },
      def: workspaceDef,
      expected: "staged"
    },
    {
      name: "workspace wins over app and default for workspace-scoped key",
      key: "fixture.root",
      staged: {},
      app: { "fixture.root": "app" },
      workspace: { "fixture.root": "ws" },
      def: workspaceDef,
      expected: "ws"
    },
    {
      name: "app wins over default when no staged/workspace value",
      key: "fixture.root",
      staged: {},
      app: { "fixture.root": "app" },
      workspace: null,
      def: workspaceDef,
      expected: "app"
    },
    {
      name: "default used when key absent from every layer",
      key: "fixture.root",
      staged: {},
      app: {},
      workspace: {},
      def: workspaceDef,
      expected: "default-ws"
    },
    // --- Scope enforcement: app-scoped key ignores workspace file ---
    {
      name: "app-scoped key ignores a workspace override (scope enforcement)",
      key: "fixture.view",
      staged: {},
      app: { "fixture.view": "app" },
      workspace: { "fixture.view": "ws-should-be-ignored" },
      def: appDef,
      expected: "app"
    },
    {
      name: "app-scoped key falls back to default, ignoring workspace file",
      key: "fixture.view",
      staged: {},
      app: {},
      workspace: { "fixture.view": "ws-should-be-ignored" },
      def: appDef,
      expected: "default-app"
    },
    {
      name: "workspace layer skipped when workspaceValues is null",
      key: "fixture.root",
      staged: {},
      app: { "fixture.root": "app" },
      workspace: null,
      def: workspaceDef,
      expected: "app"
    },
    // --- Falsy values are honored at every layer ---
    {
      name: "staged false is kept over workspace true",
      key: "fixture.root",
      staged: { "fixture.root": false },
      app: { "fixture.root": true },
      workspace: { "fixture.root": true },
      def: workspaceDef,
      expected: false
    },
    {
      name: "staged 0 is kept over app non-zero",
      key: "fixture.root",
      staged: { "fixture.root": 0 },
      app: { "fixture.root": 42 },
      workspace: null,
      def: workspaceDef,
      expected: 0
    },
    {
      name: "staged empty string is kept over app non-empty",
      key: "fixture.root",
      staged: { "fixture.root": "" },
      app: { "fixture.root": "filled" },
      workspace: null,
      def: workspaceDef,
      expected: ""
    },
    {
      name: "workspace false is kept over app true (workspace-scoped)",
      key: "fixture.root",
      staged: {},
      app: { "fixture.root": true },
      workspace: { "fixture.root": false },
      def: workspaceDef,
      expected: false
    },
    {
      name: "app false is kept over default true",
      key: "fixture.root",
      staged: {},
      app: { "fixture.root": false },
      workspace: null,
      def: { ...booleanWorkspaceDef, default: true },
      expected: false
    },
    {
      name: "default false is returned when key absent everywhere",
      key: "fixture.root",
      staged: {},
      app: {},
      workspace: {},
      def: booleanWorkspaceDef,
      expected: false
    },
    // --- Unknown key / missing definition ---
    {
      name: "unknown key with no definition returns undefined",
      key: "no.such.key",
      staged: {},
      app: {},
      workspace: null,
      def: undefined,
      expected: undefined
    },
    {
      name: "unknown key still resolves from staged when present",
      key: "no.such.key",
      staged: { "no.such.key": "staged-unknown" },
      app: {},
      workspace: null,
      def: undefined,
      expected: "staged-unknown"
    },
    {
      name: "unknown key still resolves from app when present (no definition)",
      key: "no.such.key",
      staged: {},
      app: { "no.such.key": "app-unknown" },
      workspace: null,
      def: undefined,
      expected: "app-unknown"
    }
  ];

  for (const c of cases) {
    it(c.name, () => {
      expect(resolveEffectiveValue(c.key, c.staged, c.app, c.workspace, c.def)).toBe(c.expected);
    });
  }

  it("matches the store action for a registered workspace-scoped key", async () => {
    // The store action resolves the definition from the registry and delegates
    // to the same helper. This test guards the wiring: if either path changes
    // precedence, the two diverge and this test fails.
    const MODULE_ID = "resolve-fixture";
    const ROOT = `${MODULE_ID}.root`;
    const registration = appSettingsRegistry.register({
      id: MODULE_ID,
      label: "Resolve fixture",
      scope: "app",
      sections: [
        {
          id: `${MODULE_ID}.main`,
          label: "Main",
          settings: [
            {
              key: "root",
              type: "string",
              label: "Root",
              description: "",
              default: "default-ws",
              scope: "workspace",
              section: `${MODULE_ID}.main`
            }
          ]
        }
      ]
    });
    try {
      const gateway = createMockGateway(
        null,
        JSON.stringify({ version: 1, [ROOT]: "ws" })
      );
      const store = createSettingsStore(gateway);
      await store.getState().loadSettings("/notes/work");

      const state = store.getState();
      const def = appSettingsRegistry.getDefinition(ROOT);
      // Both paths must agree on the workspace-override layer.
      expect(store.getState().getEffectiveValue(ROOT)).toBe("ws");
      expect(
        resolveEffectiveValue(ROOT, state.stagedChanges, state.appValues, state.workspaceValues, def)
      ).toBe("ws");

      // And both must agree once a staged value lands.
      store.getState().stageChange(ROOT, "staged");
      const state2 = store.getState();
      expect(store.getState().getEffectiveValue(ROOT)).toBe("staged");
      expect(
        resolveEffectiveValue(ROOT, state2.stagedChanges, state2.appValues, state2.workspaceValues, def)
      ).toBe("staged");
    } finally {
      registration.dispose();
    }
  });
});

describe("saveSettings concurrency", () => {
  it("keeps changes staged while a save is in flight", async () => {
    // The write is held open so an edit can land mid-save, which is exactly
    // what a palette toggle racing a Settings-tab edit looks like.
    let releaseWrite: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    const gateway = createMockGateway(null);
    gateway.writeAppSettings = vi.fn(async (revise: (current: string | null) => string) => {
      await held;
      return revise(null);
    });

    const store = createSettingsStore(gateway);
    await store.getState().loadSettings(null);

    store.getState().stageChange("editor.fontSize", 20);
    const saving = store.getState().saveSettings();

    // A second edit arrives before the first save's write resolves.
    store.getState().stageChange("editor.lineWrapping", false);

    releaseWrite?.();
    await saving;

    expect(store.getState().stagedChanges).toEqual({ "editor.lineWrapping": false });
    expect(store.getState().isDirty).toBe(true);
    expect(store.getState().dirtyCount).toBe(1);
  });

  it("clears the staged keys that the save actually persisted", async () => {
    const gateway = createMockGateway(null);
    const store = createSettingsStore(gateway);
    await store.getState().loadSettings(null);

    store.getState().stageChange("editor.fontSize", 20);
    await store.getState().saveSettings();

    expect(store.getState().stagedChanges).toEqual({});
    expect(store.getState().isDirty).toBe(false);
  });
});

/**
 * D45: an extension module holds settings of both scopes — the journal's folder
 * is per workspace while its calendar defaults are global (D64). Scope is a
 * property of each setting, not of the module it arrived in.
 */
describe("mixed-scope modules (D45)", () => {
  const MODULE_ID = "extension-scope-fixture";
  const ROOT = `${MODULE_ID}.root`;
  const VIEW = `${MODULE_ID}.view`;

  let registration: { dispose: () => void } | null = null;

  beforeEach(() => {
    registration = appSettingsRegistry.register({
      id: MODULE_ID,
      label: "Scope fixture",
      scope: "app",
      sections: [
        {
          id: `${MODULE_ID}.main`,
          label: "Main",
          settings: [
            {
              key: "root",
              type: "path",
              label: "Folder",
              description: "Per workspace.",
              default: "journal",
              scope: "workspace",
              section: `${MODULE_ID}.main`
            },
            {
              key: "view",
              type: "string",
              label: "View",
              description: "Global.",
              default: "month",
              scope: "app",
              section: `${MODULE_ID}.main`
            }
          ]
        }
      ]
    });
  });

  afterEach(() => {
    registration?.dispose();
    registration = null;
  });

  it("reads a workspace override for a workspace-scoped setting", async () => {
    const store = createSettingsStore(
      createMockGateway(null, JSON.stringify({ version: 1, [ROOT]: "diary" }))
    );

    await store.getState().loadSettings("/notes/work");

    expect(store.getState().getEffectiveValue(ROOT)).toBe("diary");
  });

  it("falls back to the default when the workspace has no override", async () => {
    const store = createSettingsStore(createMockGateway(null, JSON.stringify({ version: 1 })));

    await store.getState().loadSettings("/notes/work");

    expect(store.getState().getEffectiveValue(ROOT)).toBe("journal");
  });

  it("falls back to the default when no workspace is open", async () => {
    const store = createSettingsStore(createMockGateway(null, null));

    await store.getState().loadSettings(null);

    expect(store.getState().getEffectiveValue(ROOT)).toBe("journal");
  });

  it("persists a workspace-scoped edit to the workspace file", async () => {
    // The bug this covers loses the edit outright: it is routed to the workspace
    // payload and then dropped by the serializer.
    const gateway = createMockGateway(null, JSON.stringify({ version: 1 }));
    const store = createSettingsStore(gateway);
    await store.getState().loadSettings("/notes/work");

    store.getState().stageChange(ROOT, "diary");
    const result = await store.getState().saveSettings();

    expect(result.success).toBe(true);
    const written = gateway.writtenWorkspaceSettings.at(-1);
    expect(written?.rootPath).toBe("/notes/work");
    expect(JSON.parse(written?.contents ?? "{}")[ROOT]).toBe("diary");
    expect(store.getState().getEffectiveValue(ROOT)).toBe("diary");
  });

  it("reports failure rather than success when nothing could be written", async () => {
    // Reporting success while the value never left memory is how a Save button
    // ends up doing nothing, twice, with no explanation.
    const store = createSettingsStore(createMockGateway(null, null));
    await store.getState().loadSettings(null);

    store.getState().stageChange(ROOT, "diary");
    const result = await store.getState().saveSettings();

    expect(result.success).toBe(false);
    expect(store.getState().saveError).toMatch(/workspace/i);
  });

  it("keeps a workspace-scoped edit staged when there is no workspace to write it to", async () => {
    // Nothing can persist it yet, so dropping it from `stagedChanges` would lose
    // the edit outright and report success while doing so.
    const gateway = createMockGateway(null, null);
    const store = createSettingsStore(gateway);
    await store.getState().loadSettings(null);

    store.getState().stageChange(ROOT, "diary");
    await store.getState().saveSettings();

    expect(gateway.writtenWorkspaceSettings).toHaveLength(0);
    expect(store.getState().stagedChanges[ROOT]).toBe("diary");
    expect(store.getState().isDirty).toBe(true);
    expect(store.getState().getEffectiveValue(ROOT)).toBe("diary");
  });

  it("keeps a workspace override out of the app settings file", async () => {
    const gateway = createMockGateway(null, JSON.stringify({ version: 1 }));
    const store = createSettingsStore(gateway);
    await store.getState().loadSettings("/notes/work");

    store.getState().stageChange(ROOT, "diary");
    await store.getState().saveSettings();

    for (const contents of gateway.writtenAppSettings) {
      expect(Object.keys(JSON.parse(contents))).not.toContain(ROOT);
    }
  });

  it("leaves an app-scoped setting in the same module global", async () => {
    const gateway = createMockGateway(null, JSON.stringify({ version: 1 }));
    const store = createSettingsStore(gateway);
    await store.getState().loadSettings("/notes/work");

    store.getState().stageChange(VIEW, "week");
    await store.getState().saveSettings();

    const appWritten = gateway.writtenAppSettings.at(-1);
    expect(JSON.parse(appWritten ?? "{}")[VIEW]).toBe("week");
    const workspaceWritten = gateway.writtenWorkspaceSettings.at(-1);
    expect(Object.keys(JSON.parse(workspaceWritten?.contents ?? "{}"))).not.toContain(VIEW);
  });

  it("ignores a workspace file that tries to override an app-scoped setting", async () => {
    // Workspace files travel with a vault; one must not reach across scopes.
    const store = createSettingsStore(
      createMockGateway(null, JSON.stringify({ version: 1, [VIEW]: "week" }))
    );

    await store.getState().loadSettings("/notes/work");

    expect(store.getState().getEffectiveValue(VIEW)).toBe("month");
  });

  it("re-reads workspace values when the active workspace changes", async () => {
    const gateway = createMockGateway(null, JSON.stringify({ version: 1, [ROOT]: "diary" }));
    const store = createSettingsStore(gateway);
    await store.getState().loadSettings("/notes/work");

    gateway.readWorkspaceSettings = vi.fn(async () =>
      JSON.stringify({ version: 1, [ROOT]: "personal-journal" })
    );
    await store.getState().loadSettings("/notes/home");

    expect(store.getState().getEffectiveValue(ROOT)).toBe("personal-journal");
  });
});
