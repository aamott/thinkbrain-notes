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
      version: 2,
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
      version: 2,
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
      version: 2,
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
      version: 2,
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
        version: 2,
        lastWorkspacePath: "/notes/legacy",
        recentWorkspacePaths: ["/notes/legacy"],
        explorerOpen: true
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
      version: 2,
      lastWorkspacePath: "/notes/new",
      recentWorkspacePaths: ["/notes/new"],
      explorerOpen: false
    });

    expect(getWrittenSettings(gateway)).toEqual({
      [DESKTOP_STATE_KEY]: {
        version: 2,
        lastWorkspacePath: "/notes/new",
        recentWorkspacePaths: ["/notes/new"],
        explorerOpen: false
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
