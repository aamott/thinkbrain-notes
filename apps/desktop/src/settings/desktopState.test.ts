import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_DESKTOP_STATE,
  DESKTOP_STATE_KEY,
  loadDesktopState,
  parseDesktopState,
  saveDesktopState,
  type DesktopStateGateway
} from "./desktopState";

describe("desktop state persistence", () => {
  it("uses defaults for missing, malformed, and non-object settings documents", () => {
    expect(parseDesktopState(null)).toEqual(DEFAULT_DESKTOP_STATE);
    expect(parseDesktopState("{not json")).toEqual(DEFAULT_DESKTOP_STATE);
    expect(parseDesktopState("[]")).toEqual(DEFAULT_DESKTOP_STATE);
  });

  it("reads legacy flat state and missing v0 state safely", () => {
    expect(
      parseDesktopState(
        JSON.stringify({
          lastWorkspacePath: "/notes/legacy",
          explorerOpen: false
        })
      )
    ).toEqual({
      ...DEFAULT_DESKTOP_STATE,
      lastWorkspacePath: "/notes/legacy",
      recentWorkspacePaths: ["/notes/legacy"],
      explorerOpen: false
    });

    expect(
      parseDesktopState(
        JSON.stringify({
          [DESKTOP_STATE_KEY]: {
            lastWorkspacePath: "/notes/v0",
            explorerOpen: false
          }
        })
      )
    ).toEqual({
      ...DEFAULT_DESKTOP_STATE,
      lastWorkspacePath: "/notes/v0",
      recentWorkspacePaths: ["/notes/v0"],
      explorerOpen: false
    });
  });

  it("uses defaults for unsupported state versions", () => {
    expect(
      parseDesktopState(
        JSON.stringify({
          [DESKTOP_STATE_KEY]: {
            version: 99,
            lastWorkspacePath: "/notes/future",
            explorerOpen: false
          }
        })
      )
    ).toEqual(DEFAULT_DESKTOP_STATE);
  });

  it("coerces invalid field values in a supported v1 document to defaults", () => {
    expect(
      parseDesktopState(
        JSON.stringify({
          [DESKTOP_STATE_KEY]: {
            version: 1,
            lastWorkspacePath: "",
            explorerOpen: "yes"
          }
        })
      )
    ).toEqual(DEFAULT_DESKTOP_STATE);
  });

  it("hydrates v3 panel layout and clamps stale saved widths", () => {
    expect(
      parseDesktopState(
        JSON.stringify({
          [DESKTOP_STATE_KEY]: {
            version: 3,
            leftPanelWidth: 128,
            rightPanelWidth: 768,
            bottomPanelOpen: true
          }
        })
      )
    ).toEqual({
      ...DEFAULT_DESKTOP_STATE,
      leftPanelWidth: 224,
      rightPanelWidth: 480,
      bottomPanelOpen: true
    });
  });

  it("falls back to default layout values when v3 widths are missing or invalid", () => {
    expect(
      parseDesktopState(
        JSON.stringify({
          [DESKTOP_STATE_KEY]: {
            version: 3,
            leftPanelWidth: "wide",
            rightPanelWidth: null,
            bottomPanelOpen: "open"
          }
        })
      )
    ).toEqual(DEFAULT_DESKTOP_STATE);
  });

  it("loads through an injected gateway", async () => {
    const gateway = createGateway(
      JSON.stringify({
        [DESKTOP_STATE_KEY]: {
          version: 1,
          lastWorkspacePath: "/notes/current",
          explorerOpen: false
        }
      })
    );

    await expect(loadDesktopState(gateway)).resolves.toEqual({
      ...DEFAULT_DESKTOP_STATE,
      lastWorkspacePath: "/notes/current",
      recentWorkspacePaths: ["/notes/current"],
      explorerOpen: false
    });
    expect(gateway.readAppSettings).toHaveBeenCalledTimes(1);
  });

  it("updates state while preserving unrelated app settings and migrating flat fields", async () => {
    const gateway = createGateway(
      JSON.stringify({
        version: 1,
        theme: "dark",
        editor: { fontSize: 18, lineWrapping: false },
        extensionSettings: { "example.timer": { enabled: true } },
        lastWorkspacePath: "/notes/legacy",
        explorerOpen: false
      })
    );

    await expect(saveDesktopState({ explorerOpen: true }, gateway)).resolves.toEqual({
      ...DEFAULT_DESKTOP_STATE,
      lastWorkspacePath: "/notes/legacy",
      recentWorkspacePaths: ["/notes/legacy"],
      explorerOpen: true
    });

    const written = getWrittenSettings(gateway);
    expect(written).toMatchObject({
      version: 1,
      theme: "dark",
      editor: { fontSize: 18, lineWrapping: false },
      extensionSettings: { "example.timer": { enabled: true } },
      [DESKTOP_STATE_KEY]: {
        version: 4,
        lastWorkspacePath: "/notes/legacy",
        recentWorkspacePaths: ["/notes/legacy"],
        explorerOpen: true,
        leftPanelWidth: 288,
        rightPanelWidth: 320,
        bottomPanelOpen: false,
        openTabs: [],
        activeTabId: null
      }
    });
    expect(written).not.toHaveProperty("lastWorkspacePath");
    expect(written).not.toHaveProperty("explorerOpen");
  });

  it("writes a current state document when the stored JSON is malformed", async () => {
    const gateway = createGateway("{not json");

    await expect(
      saveDesktopState(
        { lastWorkspacePath: "/notes/new", explorerOpen: false },
        gateway
      )
    ).resolves.toEqual({
      ...DEFAULT_DESKTOP_STATE,
      lastWorkspacePath: "/notes/new",
      recentWorkspacePaths: ["/notes/new"],
      explorerOpen: false
    });

    expect(getWrittenSettings(gateway)).toEqual({
      [DESKTOP_STATE_KEY]: {
        version: 4,
        lastWorkspacePath: "/notes/new",
        recentWorkspacePaths: ["/notes/new"],
        explorerOpen: false,
        leftPanelWidth: 288,
        rightPanelWidth: 320,
        bottomPanelOpen: false,
        developmentExtensionDirectories: [],
        openTabs: [],
        activeTabId: null
      }
    });
  });

  it("promotes the most recent workspace, removes duplicates, and keeps the MRU list bounded", async () => {
    const paths = Array.from({ length: 13 }, (_, index) => `/notes/${index}`);
    const gateway = createGateway(
      JSON.stringify({
        [DESKTOP_STATE_KEY]: {
          version: 2,
          lastWorkspacePath: "/notes/3",
          recentWorkspacePaths: paths,
          explorerOpen: true
        }
      })
    );

    await expect(saveDesktopState({ lastWorkspacePath: "/notes/10" }, gateway)).resolves.toMatchObject({
      lastWorkspacePath: "/notes/10",
      recentWorkspacePaths: [
        "/notes/10",
        "/notes/3",
        "/notes/0",
        "/notes/1",
        "/notes/2",
        "/notes/4",
        "/notes/5",
        "/notes/6",
        "/notes/7",
        "/notes/8",
        "/notes/9",
        "/notes/11"
      ]
    });
    expect(getWrittenSettings(gateway)[DESKTOP_STATE_KEY]).toMatchObject({
      recentWorkspacePaths: [
        "/notes/10",
        "/notes/3",
        "/notes/0",
        "/notes/1",
        "/notes/2",
        "/notes/4",
        "/notes/5",
        "/notes/6",
        "/notes/7",
        "/notes/8",
        "/notes/9",
        "/notes/11"
      ]
    });
  });

  it("merges an explicitly provided recentWorkspacePaths list with the current stored list", async () => {
    const gateway = createGateway(
      JSON.stringify({
        [DESKTOP_STATE_KEY]: {
          version: 4,
          recentWorkspacePaths: ["/notes/one", "/notes/legacy"]
        }
      })
    );

    await expect(
      saveDesktopState({ recentWorkspacePaths: ["/notes/two", "/notes/legacy"] }, gateway)
    ).resolves.toMatchObject({
      recentWorkspacePaths: ["/notes/two", "/notes/legacy", "/notes/one"]
    });
  });

  /**
   * The native path treats an empty id as no id at all. This path has to agree,
   * or the fallback persists a tab id no tab can ever have.
   */
  it("treats an empty activeTabId as cleared, the way the native path does", async () => {
    const gateway = createGateway(
      JSON.stringify({
        [DESKTOP_STATE_KEY]: { version: 4, activeTabId: "tab-1" }
      })
    );

    await expect(saveDesktopState({ activeTabId: "" }, gateway)).resolves.toMatchObject({
      activeTabId: null
    });
  });

  it("keeps known recent workspaces when the current root is cleared", async () => {
    const gateway = createGateway(
      JSON.stringify({
        [DESKTOP_STATE_KEY]: {
          version: 2,
          lastWorkspacePath: "/notes/current",
          recentWorkspacePaths: ["/notes/current", "/notes/previous"],
          explorerOpen: true
        }
      })
    );

    await expect(saveDesktopState({ lastWorkspacePath: null }, gateway)).resolves.toMatchObject({
      lastWorkspacePath: null,
      recentWorkspacePaths: ["/notes/current", "/notes/previous"]
    });
  });

  it("saves panel widths and bottom panel visibility through the desktop-state gateway", async () => {
    const updateDesktopState = vi.fn(async () => JSON.stringify({
      [DESKTOP_STATE_KEY]: {
        version: 3,
        leftPanelWidth: 352,
        rightPanelWidth: 304,
        bottomPanelOpen: true
      }
    }));
    const gateway = {
      ...createGateway(null),
      updateDesktopState
    };

    await expect(
      saveDesktopState(
        { leftPanelWidth: 352, rightPanelWidth: 304, bottomPanelOpen: true },
        gateway
      )
    ).resolves.toEqual({
      ...DEFAULT_DESKTOP_STATE,
      leftPanelWidth: 352,
      rightPanelWidth: 304,
      bottomPanelOpen: true
    });
    expect(updateDesktopState).toHaveBeenCalledWith({
      leftPanelWidth: 352,
      rightPanelWidth: 304,
      bottomPanelOpen: true
    });
  });

  it("parses stored development extension directories, dropping junk entries", () => {
    expect(
      parseDesktopState(
        JSON.stringify({
          [DESKTOP_STATE_KEY]: {
            version: 3,
            developmentExtensionDirectories: ["/ext/one", "", 7, "/ext/two", "/ext/one"]
          }
        })
      )
    ).toEqual({
      ...DEFAULT_DESKTOP_STATE,
      developmentExtensionDirectories: ["/ext/one", "/ext/two"]
    });
  });

  it("saves development extension directories without touching other state", async () => {
    const gateway = createGateway(
      JSON.stringify({
        theme: "dark",
        [DESKTOP_STATE_KEY]: { version: 3, explorerOpen: false }
      })
    );

    const saved = await saveDesktopState(
      { developmentExtensionDirectories: ["/ext/one"] },
      gateway
    );

    expect(saved.developmentExtensionDirectories).toEqual(["/ext/one"]);
    expect(saved.explorerOpen).toBe(false);
    const written = getWrittenSettings(gateway);
    expect(written.theme).toBe("dark");
    expect(
      (written[DESKTOP_STATE_KEY] as Record<string, unknown>).developmentExtensionDirectories
    ).toEqual(["/ext/one"]);
  });

  /**
   * `write_app_settings` now refuses a write whose `expected` no longer
   * matches what is on disk (see `appSettingsFile.ts`). The fallback path has
   * no `updateDesktopState` command to do its read-modify-write atomically, so
   * it must pass what it read as `expected` itself or every fallback write
   * would be rejected outright once a settings file already exists.
   */
  it("sends what it read as the write's precondition", async () => {
    const raw = JSON.stringify({ theme: "dark" });
    const gateway = createGateway(raw);

    await saveDesktopState({ explorerOpen: false }, gateway);

    expect(gateway.writeAppSettings).toHaveBeenCalledWith(expect.any(String), raw);
  });
});

function createGateway(contents: string | null): DesktopStateGateway & {
  readonly readAppSettings: ReturnType<typeof vi.fn>;
  readonly writeAppSettings: ReturnType<typeof vi.fn>;
} {
  return {
    readAppSettings: vi.fn(async () => contents),
    writeAppSettings: vi.fn(async () => undefined)
  };
}

function getWrittenSettings(gateway: DesktopStateGateway & {
  readonly writeAppSettings: ReturnType<typeof vi.fn>;
}): Record<string, unknown> {
  const [contents] = gateway.writeAppSettings.mock.calls[0] as [string];
  return JSON.parse(contents) as Record<string, unknown>;
}
