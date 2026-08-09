import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSettingsStore, type SettingsStoreGateway } from "./settingsStore";
import { appSettingsRegistry } from "./settingsStore";
import { extractDefaults } from "@thinkbrain/core";

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
} {
  const writtenAppSettings: string[] = [];
  const writtenWorkspaceSettings: { rootPath: string; contents: string }[] = [];

  return {
    readAppSettings: vi.fn(async () => appSettings),
    writeAppSettings: vi.fn(async (contents: string) => {
      writtenAppSettings.push(contents);
    }),
    readWorkspaceSettings: vi.fn(async () => workspaceSettings),
    writeWorkspaceSettings: vi.fn(async (rootPath: string, contents: string) => {
      writtenWorkspaceSettings.push({ rootPath, contents });
    }),
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
    gateway.writeAppSettings = vi.fn(async () => {
      await held;
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
