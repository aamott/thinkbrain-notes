import { beforeEach, describe, expect, it, vi } from "vitest";

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
