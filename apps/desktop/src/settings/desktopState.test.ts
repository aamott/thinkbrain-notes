import { describe, expect, it, vi } from "vitest";

import {
  collapsedGroups,
  workspaceTabs,
  DEFAULT_DESKTOP_STATE,
  DESKTOP_STATE_KEY,
  forgetWorkspace,
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

  /**
   * Running a newer build and then an older one — a branch switch, a rebuild —
   * used to lose the workspace, the open tabs and the panel layout, because a
   * version this build had not reached was treated as unreadable. Each version
   * has only ever added fields, so a newer document is readable for everything
   * this build knows; what it added is what gets left behind.
   */
  it("reads a document from a newer build rather than discarding it", () => {
    expect(
      parseDesktopState(
        JSON.stringify({
          [DESKTOP_STATE_KEY]: {
            version: 99,
            lastWorkspacePath: "/notes/future",
            explorerOpen: false,
            somethingLaterAdded: "not understood here"
          }
        })
      )
    ).toEqual({
      ...DEFAULT_DESKTOP_STATE,
      lastWorkspacePath: "/notes/future",
      recentWorkspacePaths: ["/notes/future"],
      explorerOpen: false
    });
  });

  it("still uses defaults when the version itself is not a version", () => {
    expect(
      parseDesktopState(
        JSON.stringify({
          [DESKTOP_STATE_KEY]: { version: "five", lastWorkspacePath: "/notes/broken" }
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

  it("forgets a workspace through a targeted, non-debounced update", async () => {
    const gateway = createGateway(null);

    await expect(forgetWorkspace("/notes/old", gateway)).resolves.toBeDefined();
    expect(gateway.updateDesktopState).toHaveBeenCalledWith({
      forgetWorkspacePath: "/notes/old"
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

});

function createGateway(contents: string | null): DesktopStateGateway & {
  readonly readAppSettings: ReturnType<typeof vi.fn>;
  readonly updateDesktopState: ReturnType<typeof vi.fn>;
} {
  return {
    readAppSettings: vi.fn(async () => contents),
    updateDesktopState: vi.fn(async () => contents ?? "null")
  };
}

describe("collapsed groups (D53)", () => {
  /**
   * Not settings and not the vault: what a user collapsed in a panel is not a
   * preference they configured, and churning the settings document on every
   * toggle would collide with the writes that are.
   */
  it("keeps a view's collapsed groups per workspace", () => {
    const state = parseDesktopState(
      JSON.stringify({
        desktopState: {
          version: 5,
          workspaceViews: {
            "/vault": { journal: ["2026", "2026-08"] },
            "/other": { journal: ["2025"] }
          }
        }
      })
    );

    expect(collapsedGroups(state, "/vault", "journal")).toEqual(["2026", "2026-08"]);
    expect(collapsedGroups(state, "/other", "journal")).toEqual(["2025"]);
    // A workspace or view nothing was stored for has everything open, which is
    // the same answer as a stored empty list — and the right default either way.
    expect(collapsedGroups(state, "/vault", "explorer")).toEqual([]);
    expect(collapsedGroups(state, "/unknown", "journal")).toEqual([]);
    expect(collapsedGroups(state, null, "journal")).toEqual([]);
  });

  it("reads a hand-edited document without refusing to draw", () => {
    const state = parseDesktopState(
      JSON.stringify({
        desktopState: {
          version: 5,
          workspaceViews: {
            "/vault": { journal: ["2026", 7, null], broken: "not a list" },
            "/other": "not an object"
          }
        }
      })
    );

    expect(collapsedGroups(state, "/vault", "journal")).toEqual(["2026"]);
    expect(collapsedGroups(state, "/vault", "broken")).toEqual([]);
    expect(collapsedGroups(state, "/other", "journal")).toEqual([]);
  });

  /**
   * The version bump must not cost the user their open tabs. A document written
   * by the previous schema is read, not replaced with defaults.
   */
  it("keeps what the previous schema stored", () => {
    const state = parseDesktopState(
      JSON.stringify({
        desktopState: {
          version: 4,
          leftPanelWidth: 300,
          openTabs: [{ id: "tab-1", title: "Note", kind: "editor" }]
        }
      })
    );

    expect(state.leftPanelWidth).toBe(300);
    expect(state.openTabs).toHaveLength(1);
    expect(state.workspaceViews).toEqual({});
  });
});

describe("per-workspace tabs", () => {
  /**
   * The bug this fixes: tabs were one flat list in a document every window
   * shares, so two windows on two vaults overwrote each other's list and then
   * both restored the same tabs — pointing at whichever vault wrote last.
   */
  it("keeps each workspace's tabs apart", () => {
    const state = parseDesktopState(
      JSON.stringify({
        desktopState: {
          version: 5,
          workspaceTabs: {
            "/vault": {
              openTabs: [
                { id: "a", title: "One", kind: "editor", rootPath: "/vault", relativePath: "one.md" }
              ],
              activeTabId: "a"
            },
            "/other": {
              openTabs: [
                { id: "b", title: "Two", kind: "editor", rootPath: "/other", relativePath: "two.md" }
              ],
              activeTabId: "b"
            }
          }
        }
      })
    );

    expect(workspaceTabs(state, "/vault").openTabs).toHaveLength(1);
    expect(workspaceTabs(state, "/vault").openTabs[0]?.relativePath).toBe("one.md");
    expect(workspaceTabs(state, "/vault").activeTabId).toBe("a");
    expect(workspaceTabs(state, "/other").openTabs[0]?.relativePath).toBe("two.md");
    // A workspace nothing was stored for opens with nothing, not with somebody
    // else's tabs — which is the whole point.
    expect(workspaceTabs(state, "/unknown").openTabs).toEqual([]);
    expect(workspaceTabs(state, null).openTabs).toEqual([]);
  });

  /**
   * An existing user upgrading has tabs only in the old flat field. Those belong
   * to whatever workspace was last open, so that workspace — and only that one —
   * inherits them.
   */
  it("gives the legacy flat tab list to the workspace that was last open", () => {
    const state = parseDesktopState(
      JSON.stringify({
        desktopState: {
          version: 5,
          lastWorkspacePath: "/vault",
          openTabs: [
            { id: "a", title: "One", kind: "editor", rootPath: "/vault", relativePath: "one.md" }
          ],
          activeTabId: "a"
        }
      })
    );

    expect(workspaceTabs(state, "/vault").openTabs[0]?.relativePath).toBe("one.md");
    expect(workspaceTabs(state, "/vault").activeTabId).toBe("a");
    expect(workspaceTabs(state, "/other").openTabs).toEqual([]);
  });

  it("prefers the keyed tabs over the legacy list for the same workspace", () => {
    const state = parseDesktopState(
      JSON.stringify({
        desktopState: {
          version: 5,
          lastWorkspacePath: "/vault",
          openTabs: [
            { id: "old", title: "Old", kind: "editor", rootPath: "/vault", relativePath: "old.md" }
          ],
          activeTabId: "old",
          workspaceTabs: {
            "/vault": {
              openTabs: [
                { id: "new", title: "New", kind: "editor", rootPath: "/vault", relativePath: "new.md" }
              ],
              activeTabId: "new"
            }
          }
        }
      })
    );

    expect(workspaceTabs(state, "/vault").openTabs).toHaveLength(1);
    expect(workspaceTabs(state, "/vault").openTabs[0]?.relativePath).toBe("new.md");
  });

  it("reads a hand-edited document without refusing to draw", () => {
    const state = parseDesktopState(
      JSON.stringify({
        desktopState: {
          version: 5,
          workspaceTabs: {
            "/vault": { openTabs: [{ id: "a", title: "One", kind: "editor" }, 7, null], activeTabId: 5 },
            "/other": "not an object"
          }
        }
      })
    );

    expect(workspaceTabs(state, "/vault").openTabs).toHaveLength(1);
    expect(workspaceTabs(state, "/vault").activeTabId).toBeNull();
    expect(workspaceTabs(state, "/other").openTabs).toEqual([]);
  });

  it("sends a targeted update so one window does not overwrite another's tabs", async () => {
    const updateDesktopState = vi.fn(async () =>
      JSON.stringify({
        desktopState: {
          version: 5,
          recentWorkspacePaths: ["/vault", "/other"],
          workspaceTabs: {
            "/vault": {
              openTabs: [
                { id: "a", title: "One", kind: "editor", rootPath: "/vault", relativePath: "one.md" }
              ],
              activeTabId: "a"
            },
            "/other": {
              openTabs: [
                { id: "b", title: "Two", kind: "editor", rootPath: "/other", relativePath: "two.md" }
              ],
              activeTabId: "b"
            }
          }
        }
      })
    );
    const gateway = { ...createGateway(null), updateDesktopState };

    const next = await saveDesktopState(
      {
        lastWorkspacePath: "/vault",
        workspaceTabs: {
          workspacePath: "/vault",
          openTabs: [
            { id: "a", title: "One", kind: "editor", rootPath: "/vault", relativePath: "one.md" }
          ],
          activeTabId: "a"
        }
      },
      gateway
    );

    // Only this window's workspace is sent; the merge itself is the host's
    // (see the Rust `tabs_are_kept_per_workspace` test).
    expect(updateDesktopState).toHaveBeenCalledWith({
      lastWorkspacePath: "/vault",
      workspaceTabs: {
        workspacePath: "/vault",
        openTabs: [
          { id: "a", title: "One", kind: "editor", rootPath: "/vault", relativePath: "one.md" }
        ],
        activeTabId: "a"
      }
    });
    expect(workspaceTabs(next, "/vault").openTabs[0]?.relativePath).toBe("one.md");
    // The other window's entry survived the write.
    expect(workspaceTabs(next, "/other").openTabs[0]?.relativePath).toBe("two.md");
  });
});
