import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSettingsStore,
  selectDirtyCount,
  selectIsDirty
} from "./settingsStore";
import { appSettingsRegistry } from "./settingsRegistry";
import { createMockGateway, APP_JSON_WITH_DESKTOP_STATE } from "./settingsStoreTestHelpers";
import { resolveEffectiveValue } from "./settingsHelpers";
import { extractDefaults, type SettingDefinition } from "@thinkbrain/core";

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
      expect(selectIsDirty(state)).toBe(false);
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
      expect(state.workspaceValues).toMatchObject({ "sync.destination": "" });
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
    it("updates stagedChanges and the dirty flag", async () => {
      const gateway = createMockGateway(null);
      const store = createSettingsStore(gateway);
      await store.getState().loadSettings(null);

      store.getState().stageChange("appearance.theme", "dark");

      const state = store.getState();
      expect(state.stagedChanges["appearance.theme"]).toBe("dark");
      expect(selectIsDirty(state)).toBe(true);
      expect(selectDirtyCount(state)).toBe(1);
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
      expect(selectIsDirty(state)).toBe(false);
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
     * The bug this pins: the raw JSON read at load is a snapshot.
     * `update_desktop_state` writes to the same document on every tab open,
     * panel resize, or workspace switch — all of which happen after load and
     * before the user presses Save. A save that serializes against the
     * snapshot instead of the document as it is right now reverts every one of
     * those changes, so the store serializes inside the write callback against
     * whatever the gateway currently holds.
     */
    it("does not revert desktopState written since the store loaded", async () => {
      const gateway = createMockGateway(APP_JSON_WITH_DESKTOP_STATE);
      const store = createSettingsStore(gateway);
      await store.getState().loadSettings(null);

      // A tab opened after load, via `update_desktop_state` — not through this
      // store, so the snapshot read at load never saw it.
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
            workspaceTabs: {
              "/notes/test": {
                openTabs: [{ id: "a", title: "A", kind: "editor" }],
                activeTabId: "a"
              }
            }
          }
        })
      );

      store.getState().stageChange("appearance.theme", "light");
      const result = await store.getState().saveSettings();

      expect(result.success).toBe(true);
      const written = JSON.parse(gateway.writtenAppSettings.at(-1) as string);
      expect(written.desktopState.workspaceTabs["/notes/test"].openTabs).toEqual([
        { id: "a", title: "A", kind: "editor" }
      ]);
      expect(written.desktopState.workspaceTabs["/notes/test"].activeTabId).toBe("a");
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
        expect(selectIsDirty(store.getState())).toBe(true);
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
      expect(selectIsDirty(state)).toBe(false);
      expect(selectDirtyCount(state)).toBe(0);
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
      expect(selectDirtyCount(state)).toBe(1);
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
    // One smoke test through the store action; the full precedence matrix
    // (including falsy handling) lives in the canonical resolveEffectiveValue
    // table below, and the wiring test there proves delegation.
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
    expect(selectIsDirty(store.getState())).toBe(true);
    expect(selectDirtyCount(store.getState())).toBe(1);
  });

  it("clears the staged keys that the save actually persisted", async () => {
    const gateway = createMockGateway(null);
    const store = createSettingsStore(gateway);
    await store.getState().loadSettings(null);

    store.getState().stageChange("editor.fontSize", 20);
    await store.getState().saveSettings();

    expect(store.getState().stagedChanges).toEqual({});
    expect(selectIsDirty(store.getState())).toBe(false);
  });
});
