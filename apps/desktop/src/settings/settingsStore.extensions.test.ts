import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSettingsStore, selectIsDirty } from "./settingsStore";
import { appSettingsRegistry } from "./settingsRegistry";
import { createMockGateway, APP_JSON_WITH_DESKTOP_STATE } from "./settingsStoreTestHelpers";
import type { SettingsModule } from "@thinkbrain/core";

/**
 * Extension-facing store behavior: mixed-scope modules, the scoped
 * `settings.set` write, and late-registered schema merging.
 */

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
    expect(selectIsDirty(store.getState())).toBe(true);
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

/**
 * The scoped write behind extension `settings.set` (D81): only the one key is
 * persisted, so an extension's write neither flushes unrelated staged edits
 * nor gets stranded by them.
 */
describe("setSingleSettingImmediately (scoped write)", () => {
  it("persists only its own key, leaving other staged changes pending", async () => {
    const gateway = createMockGateway(APP_JSON_WITH_DESKTOP_STATE);
    const store = createSettingsStore(gateway);
    await store.getState().loadSettings(null);

    store.getState().stageChange("appearance.theme", "light");
    await store.getState().setSingleSettingImmediately("editor.fontSize", 20);

    const written = JSON.parse(gateway.writtenAppSettings.at(-1) as string);
    expect(written["editor.fontSize"]).toBe(20);
    // The unrelated staged edit was not flushed: the document keeps the
    // value it had, and the edit stays pending for the user's own save.
    expect(written["appearance.theme"]).toBe("dark");
    expect(store.getState().stagedChanges).toEqual({ "appearance.theme": "light" });
    expect(store.getState().appValues["editor.fontSize"]).toBe(20);
  });

  it("persists even when an unrelated staged value would fail validation", async () => {
    // The bug this pins: a full save validates every effective value, so one
    // bad staged key used to strand the extension's write as phantom-dirty.
    const gateway = createMockGateway(null);
    const store = createSettingsStore(gateway);
    await store.getState().loadSettings(null);
    store.getState().stageChange("editor.fontSize", 999);

    await store.getState().setSingleSettingImmediately("appearance.theme", "dark");

    expect(gateway.writeAppSettings).toHaveBeenCalledTimes(1);
    expect(store.getState().stagedChanges).toEqual({ "editor.fontSize": 999 });
    expect(store.getState().appValues["appearance.theme"]).toBe("dark");
  });

  it("keeps the value staged when the write fails, so the session honours it", async () => {
    const gateway = createMockGateway(null);
    const store = createSettingsStore(gateway);
    await store.getState().loadSettings(null);
    gateway.writeAppSettings = vi.fn(async () => {
      throw new Error("disk is full");
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await store.getState().setSingleSettingImmediately("appearance.theme", "dark");

    expect(store.getState().stagedChanges["appearance.theme"]).toBe("dark");
    expect(store.getState().getEffectiveValue("appearance.theme")).toBe("dark");
    errors.mockRestore();
  });

  it("keeps a workspace-scoped write staged when no workspace is open", async () => {
    const gateway = createMockGateway(null);
    const store = createSettingsStore(gateway);
    await store.getState().loadSettings(null);

    await store.getState().setSingleSettingImmediately("sync.destination", "nas");

    expect(gateway.writeWorkspaceSettings).not.toHaveBeenCalled();
    expect(store.getState().stagedChanges["sync.destination"]).toBe("nas");
    expect(store.getState().getEffectiveValue("sync.destination")).toBe("nas");
  });

  it("rejects an invalid value for its own key without touching other keys", async () => {
    const gateway = createMockGateway(null);
    const store = createSettingsStore(gateway);
    await store.getState().loadSettings(null);
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await store.getState().setSingleSettingImmediately("editor.fontSize", 999);

    expect(gateway.writeAppSettings).not.toHaveBeenCalled();
    expect(store.getState().stagedChanges["editor.fontSize"]).toBe(999);
    expect(store.getState().validationDiagnostics.map((d) => d.path)).toContain(
      "editor.fontSize"
    );
    errors.mockRestore();
  });
});

/**
 * Late-registered schemas: `loadSettings` drops keys with no registered
 * definition, so an extension schema that registers after load has to pull
 * its persisted values out of the last-read document — which is exactly what
 * the store's registry subscription does.
 */
describe("late-registered schema values", () => {
  const LATE_FLAG = "late-module.flag";
  const lateModule: SettingsModule = {
    id: "late-module",
    label: "Late",
    scope: "app",
    sections: [
      {
        id: "late-module.section",
        label: "Late",
        settings: [
          {
            key: "flag",
            type: "boolean",
            label: "Flag",
            description: "A late-registered flag.",
            default: false,
            scope: "app",
            section: "late-module.section"
          }
        ]
      }
    ]
  };
  const LATE_ROOT = "late-ws.root";
  const lateWorkspaceModule: SettingsModule = {
    id: "late-ws",
    label: "Late workspace",
    scope: "app",
    sections: [
      {
        id: "late-ws.section",
        label: "Late workspace",
        settings: [
          {
            key: "root",
            type: "path",
            label: "Root",
            description: "A late-registered per-workspace folder.",
            default: "journal",
            scope: "workspace",
            section: "late-ws.section"
          }
        ]
      }
    ]
  };

  it("merges a persisted extension value when its schema registers after load", async () => {
    const gateway = createMockGateway(
      JSON.stringify({ version: 1, [LATE_FLAG]: true })
    );
    const store = createSettingsStore(gateway);
    await store.getState().loadSettings(null);
    // Unknown at load: the key was dropped, not even a default held.
    expect(store.getState().appValues[LATE_FLAG]).toBeUndefined();

    const registration = appSettingsRegistry.register(lateModule);
    try {
      expect(store.getState().appValues[LATE_FLAG]).toBe(true);
      expect(store.getState().getEffectiveValue(LATE_FLAG)).toBe(true);
    } finally {
      registration.dispose();
    }
  });

  it("merges a workspace-scoped persisted value for the open workspace", async () => {
    const gateway = createMockGateway(
      null,
      JSON.stringify({ version: 1, [LATE_ROOT]: "diary" })
    );
    const store = createSettingsStore(gateway);
    await store.getState().loadSettings("/notes/work");
    expect(store.getState().workspaceValues?.[LATE_ROOT]).toBeUndefined();

    const registration = appSettingsRegistry.register(lateWorkspaceModule);
    try {
      expect(store.getState().workspaceValues?.[LATE_ROOT]).toBe("diary");
      expect(store.getState().getEffectiveValue(LATE_ROOT)).toBe("diary");
    } finally {
      registration.dispose();
    }
  });

  it("keeps a staged user edit effective when the schema registers late", async () => {
    const gateway = createMockGateway(
      JSON.stringify({ version: 1, [LATE_FLAG]: false })
    );
    const store = createSettingsStore(gateway);
    await store.getState().loadSettings(null);
    // A pending edit for the not-yet-registered key — the merge must fill the
    // loaded layer without overwriting the user's unsaved choice.
    store.setState({ stagedChanges: { [LATE_FLAG]: true } });

    const registration = appSettingsRegistry.register(lateModule);
    try {
      expect(store.getState().stagedChanges[LATE_FLAG]).toBe(true);
      expect(store.getState().getEffectiveValue(LATE_FLAG)).toBe(true);
    } finally {
      registration.dispose();
    }
  });

  it("does not roll back a value written in-session when the module re-registers", async () => {
    const registration = appSettingsRegistry.register(lateModule);
    const gateway = createMockGateway(
      JSON.stringify({ version: 1, [LATE_FLAG]: false })
    );
    const store = createSettingsStore(gateway);
    await store.getState().loadSettings(null);
    // An in-session write (e.g. the extension's own settings.set).
    await store.getState().setSingleSettingImmediately(LATE_FLAG, true);

    // Deactivate + reactivate must not roll the session value back to the
    // document's stale copy.
    registration.dispose();
    const second = appSettingsRegistry.register(lateModule);
    try {
      expect(store.getState().appValues[LATE_FLAG]).toBe(true);
    } finally {
      second.dispose();
    }
  });

  it("does nothing before the first successful load", () => {
    const store = createSettingsStore(createMockGateway(null));

    const registration = appSettingsRegistry.register(lateModule);
    try {
      expect(store.getState().appValues[LATE_FLAG]).toBeUndefined();
    } finally {
      registration.dispose();
    }
  });
});
