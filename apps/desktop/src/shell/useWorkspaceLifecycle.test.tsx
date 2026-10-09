// @vitest-environment happy-dom
/**
 * What a window restores when it opens.
 *
 * The case that matters most here shipped as a bug: two windows on two vaults
 * showed each other's tabs, because tabs were one flat list in a document every
 * window shares. The fix keys them by workspace; these tests are what stops it
 * coming back.
 *
 * Mounting this hook needs its modules mocked with `vi.mock`, not `vi.spyOn` —
 * ESM exports are not writable under Vite, so a spy silently does nothing and
 * the real module runs. An earlier attempt failed that way and looked like the
 * hook being untestable.
 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getExtensionBootstrap,
  setExtensionBootstrap,
  type ExtensionBootstrap
} from "../extensions/bootstrapRef";
import type { DesktopState, WorkspaceTabsUpdate } from "../settings/desktopState";
import { desktopTabRegistry } from "../tabs/tabRegistry";
import type { DesktopTabAction, DesktopTabState } from "../tabs/tabModel";

/** What `loadDesktopState` will answer with, set per test. */
let storedState: DesktopState;
/** What the native side says this window's workspace is, set per test. */
let windowRoot: string | null = null;
/** Every targeted tab update the hook persisted. */
let savedTabs: WorkspaceTabsUpdate[] = [];
/** Every desktop-state update the hook persisted. */
let savedUpdates: Record<string, unknown>[] = [];

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
  invoke: () => Promise.resolve(null),
  convertFileSrc: (path: string) => path
}));

vi.mock("../settings/desktopState", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../settings/desktopState")>();
  return {
    ...actual,
    loadDesktopState: () => Promise.resolve(storedState),
    saveDesktopState: (update: { workspaceTabs?: WorkspaceTabsUpdate }) => {
      savedUpdates.push(update);
      if (update.workspaceTabs) savedTabs.push(update.workspaceTabs);
      return Promise.resolve(storedState);
    }
  };
});

vi.mock("../workspace/workspaceAdapter", () => ({
  workspaceDesktopApi: {
    windowWorkspaceRoot: () => Promise.resolve(windowRoot),
    openWorkspace: () => Promise.resolve({ name: "vault", files: [] })
  }
}));

vi.mock("../workspace/workspaceWatcher", () => ({
  watchWorkspace: () => Promise.resolve(() => {})
}));
vi.mock("../events/noteChangeSubscription", () => ({
  subscribeToNoteChanges: () => () => {}
}));
vi.mock("../extensions/workspaceBridge", () => ({
  setWorkspaceBridge: () => {},
  // Imported transitively through `desktopExtensionHost` (for the contribution
  // id helpers); never called under these mocks.
  getWorkspaceBridge: () => null
}));

const indexStore = {
  getState: () => ({
    subscribeToEvents: () => () => {},
    indexWorkspace: () => {},
    clearWorkspace: () => {},
    rootPath: null
  })
};
vi.mock("../search/searchIndexStore", () => ({ useSearchIndexStore: indexStore }));
vi.mock("../wikiLinks/wikiLinkIndexStore", () => ({ useWikiLinkIndexStore: indexStore }));
vi.mock("../settings/settingsStore", () => ({
  useSettingsStore: Object.assign(() => false, {
    getState: () => ({
      loaded: true,
      workspaceRootPath: null,
      loadSettings: () => Promise.resolve()
    })
  }),
  // Read transitively at `desktopExtensionHost` module load; never exercised
  // under these tests.
  appSettingsRegistry: {
    register: () => ({ dispose: () => {} }),
    getDefinition: () => undefined
  }
}));

const { useWorkspaceLifecycle } = await import("./useWorkspaceLifecycle");
const { DEFAULT_DESKTOP_STATE } = await import("../settings/desktopState");

const NO_TABS: DesktopTabState = {
  tabs: [],
  activeTabId: null,
  closeRequest: null,
  history: { entries: [], cursor: -1 }
};

const tab = (root: string, note: string) => ({
  id: `editor:${root}:${note}`,
  title: note,
  kind: "editor",
  rootPath: root,
  relativePath: note
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;
/** The mounted hook's return, for tests that drive its callbacks directly. */
let lifecycle: ReturnType<typeof useWorkspaceLifecycle> | null = null;
/** Extra mounts (lazy tab placeholders rendered directly), disposed per test. */
const extraRoots: { root: Root; host: HTMLDivElement }[] = [];

beforeEach(() => {
  storedState = DEFAULT_DESKTOP_STATE;
  windowRoot = null;
  savedTabs = [];
  savedUpdates = [];
  lifecycle = null;
  setExtensionBootstrap(null);
});

/** The hook's tab-persist debounce, so a test can outwait it. */
const TAB_PERSIST_DELAY_MS = 400;

const settle = (ms: number) => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, ms));
});

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  for (const extra of extraRoots.splice(0)) {
    await act(async () => extra.root.unmount());
    extra.host.remove();
  }
  setExtensionBootstrap(null);
  // The tab save is debounced and its timer outlives the unmount — the shell
  // cancels it explicitly on teardown, and a test that did not would let its
  // write land in the middle of the next one.
  await settle(TAB_PERSIST_DELAY_MS + 50);
  savedTabs = [];
});

/**
 * Mounts the hook as one window and reports what it asked the tabs to do.
 *
 * The callbacks are built once, outside the component. The hook's restore
 * effect lists `dispatchTabs` and `loadDocumentIntoView` in its dependencies
 * and the shell hands it stable ones — a reducer dispatch and a `useCallback`.
 * Fresh closures per render re-run that effect, which sets state, which
 * renders again: the mount never settles. Worth knowing before writing the
 * next test against this hook.
 */
async function openWindow(tabState: DesktopTabState = NO_TABS): Promise<DesktopTabAction[]> {
  const actions: DesktopTabAction[] = [];
  const dispatchTabs = (action: DesktopTabAction) => {
    actions.push(action);
  };
  const loadDocumentIntoView = () => {};
  const openMarkdownDocument = () => {};
  function Host() {
    lifecycle = useWorkspaceLifecycle({
      tabState,
      dispatchTabs,
      loadDocumentIntoView,
      openMarkdownDocument
    });
    return null;
  }
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(<Host />);
  });
  return actions;
}

const openedNotes = (actions: readonly DesktopTabAction[]): readonly (string | undefined)[] =>
  actions
    .filter((action) => action.type === "open")
    .map((action) => action.tab.resource?.relativePath);

describe("what a window restores", () => {
  it("opens only the tabs belonging to its own workspace", async () => {
    storedState = {
      ...DEFAULT_DESKTOP_STATE,
      lastWorkspacePath: "/vault-a",
      workspaceTabs: {
        "/vault-a": { openTabs: [tab("/vault-a", "a.md")], activeTabId: "editor:/vault-a:a.md" },
        "/vault-b": { openTabs: [tab("/vault-b", "b.md")], activeTabId: "editor:/vault-b:b.md" }
      }
    };
    windowRoot = "/vault-b";

    expect(openedNotes(await openWindow())).toEqual(["b.md"]);
  });

  it("opens nothing when its workspace has no tabs of its own", async () => {
    // The defect, stated directly: a window on a vault nothing was stored for
    // must start empty rather than inherit the other vault's tabs.
    storedState = {
      ...DEFAULT_DESKTOP_STATE,
      lastWorkspacePath: "/vault-a",
      workspaceTabs: {
        "/vault-a": { openTabs: [tab("/vault-a", "a.md")], activeTabId: null }
      }
    };
    windowRoot = "/vault-b";

    expect(openedNotes(await openWindow())).toEqual([]);
  });

  it("activates the tab its own workspace left active", async () => {
    storedState = {
      ...DEFAULT_DESKTOP_STATE,
      workspaceTabs: {
        "/vault-b": { openTabs: [tab("/vault-b", "b.md")], activeTabId: "editor:/vault-b:b.md" }
      }
    };
    windowRoot = "/vault-b";

    const actions = await openWindow();
    expect(actions.filter((action) => action.type === "activate")).toEqual([
      { type: "activate", tabId: "editor:/vault-b:b.md" }
    ]);
  });

  it("gives an upgrading user's legacy tabs to the workspace that was last open", async () => {
    storedState = {
      ...DEFAULT_DESKTOP_STATE,
      lastWorkspacePath: "/vault-a",
      openTabs: [tab("/vault-a", "a.md")],
      activeTabId: "editor:/vault-a:a.md"
    };
    windowRoot = "/vault-a";

    expect(openedNotes(await openWindow())).toEqual(["a.md"]);
  });

  it("does not hand the legacy tabs to a different workspace", async () => {
    storedState = {
      ...DEFAULT_DESKTOP_STATE,
      lastWorkspacePath: "/vault-a",
      openTabs: [tab("/vault-a", "a.md")],
      activeTabId: "editor:/vault-a:a.md"
    };
    windowRoot = "/vault-b";

    expect(openedNotes(await openWindow())).toEqual([]);
  });

  it("falls back to the last workspace when the window has no root of its own", async () => {
    storedState = {
      ...DEFAULT_DESKTOP_STATE,
      lastWorkspacePath: "/vault-a",
      workspaceTabs: {
        "/vault-a": { openTabs: [tab("/vault-a", "a.md")], activeTabId: null }
      }
    };
    windowRoot = null;

    expect(openedNotes(await openWindow())).toEqual(["a.md"]);
  });

  it("opens a single Welcome tab when there is no workspace and nothing to restore", async () => {
    storedState = { ...DEFAULT_DESKTOP_STATE };
    windowRoot = null;

    const opens = (await openWindow()).filter((action) => action.type === "open");
    expect(opens.map((action) => [action.tab.kind, action.tab.title])).toEqual([
      ["new-tab", "Welcome"]
    ]);
  });

  it("does not open the Welcome tab when a workspace was restored", async () => {
    storedState = { ...DEFAULT_DESKTOP_STATE };
    windowRoot = "/vault-b";

    expect((await openWindow()).filter((action) => action.type === "open")).toEqual([]);
  });
});

describe("what a window persists", () => {
  it("saves its tabs against its own workspace, naming no other", async () => {
    storedState = { ...DEFAULT_DESKTOP_STATE };
    windowRoot = "/vault-b";

    await openWindow({
      tabs: [
        {
          id: "editor:/vault-b:b.md",
          title: "b.md",
          kind: "editor",
          resource: { rootPath: "/vault-b", relativePath: "b.md" }
        }
      ],
      activeTabId: "editor:/vault-b:b.md",
      closeRequest: null,
      history: { entries: ["editor:/vault-b:b.md"], cursor: 0 }
    } as DesktopTabState);

    // Debounced, so the write lands after the delay rather than on mount.
    await settle(TAB_PERSIST_DELAY_MS + 50);

    expect(savedTabs.length).toBeGreaterThan(0);
    for (const saved of savedTabs) {
      expect(saved.workspacePath).toBe("/vault-b");
    }
    expect(savedTabs.at(-1)?.openTabs.map((t) => t.relativePath)).toEqual(["b.md"]);
  });

  it("persists only the last path on open — recents are promoted natively, not from a stale list", async () => {
    storedState = { ...DEFAULT_DESKTOP_STATE };
    windowRoot = null;

    await openWindow();
    await act(async () => {
      lifecycle?.handleWorkspaceOpened("/vault-b", {
        workspace: { root_path: "/vault-b", name: "b" },
        files: []
      });
    });

    // A window that had never heard of another window's recents must not send
    // its own list: the Rust side promotes `lastWorkspacePath`, and sending
    // this window's copy would resurrect a path another window just forgot.
    const last = savedUpdates.at(-1);
    expect(last).toEqual({ lastWorkspacePath: "/vault-b" });
  });

  it("persists only the last path on launch too", async () => {
    storedState = { ...DEFAULT_DESKTOP_STATE };
    windowRoot = null;

    await openWindow();
    await act(async () => {
      lifecycle?.handleWorkspaceLaunched("/vault-c");
    });

    expect(savedUpdates.at(-1)).toEqual({ lastWorkspacePath: "/vault-c" });
  });
});

/**
 * An extension tab kind (`extensionId.kind`, e.g. `journal-calendar.calendar`)
 * registers only inside `activate`, so a kind persisted across a restart is
 * unknown to the registry simply because its owner is still asleep. Restore
 * must stub the kind and wake the owner — dropping the tab silently is data
 * loss.
 */
describe("restoring extension tab kinds", () => {
  const staticTab = (kind: string, title: string) => ({ id: kind, title, kind });

  /** Mounts a node in its own container; cleaned up by afterEach. */
  const renderNode = async (node: ReactNode): Promise<HTMLDivElement> => {
    const container = document.createElement("div");
    document.body.append(container);
    const nodeRoot = createRoot(container);
    extraRoots.push({ root: nodeRoot, host: container });
    await act(async () => nodeRoot.render(node));
    return container;
  };

  /** A bootstrap stub whose `activate` resolves when `release` fires. */
  const fakeBootstrap = () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const activate = vi.fn(() => gate);
    const bootstrap: ExtensionBootstrap = {
      entries: () => [],
      activate,
      activateAll: () => Promise.resolve(),
      addLocalExtension: () => {},
      removeLocalExtension: () => Promise.resolve(),
      subscribe: () => () => {},
      dispose: () => Promise.resolve()
    };
    return { bootstrap, activate, release };
  };

  it("restores a persisted extension kind as a placeholder instead of dropping it", async () => {
    storedState = {
      ...DEFAULT_DESKTOP_STATE,
      workspaceTabs: {
        "/vault": {
          openTabs: [staticTab("sleepy-ext.calendar", "Calendar")],
          activeTabId: "sleepy-ext.calendar"
        }
      }
    };
    windowRoot = "/vault";
    // No bootstrap is published: the owner cannot be woken, yet the tab must
    // still restore — its placeholder reports the failure when viewed.
    expect(getExtensionBootstrap()).toBeNull();

    const actions = await openWindow();

    const opens = actions.filter((action) => action.type === "open");
    expect(opens.map((action) => [action.tab.id, action.tab.kind, action.tab.title])).toEqual([
      ["sleepy-ext.calendar", "sleepy-ext.calendar", "Calendar"]
    ]);
    expect(actions.filter((action) => action.type === "activate")).toEqual([
      { type: "activate", tabId: "sleepy-ext.calendar" }
    ]);
    const view = desktopTabRegistry.get("sleepy-ext.calendar");
    expect(view?.placeholder).toBe(true);
  });

  it("still drops a persisted kind that no extension could own", async () => {
    storedState = {
      ...DEFAULT_DESKTOP_STATE,
      workspaceTabs: {
        "/vault": {
          openTabs: [staticTab("not-a-kind", "Gone")],
          activeTabId: null
        }
      }
    };
    windowRoot = "/vault";

    expect((await openWindow()).filter((action) => action.type === "open")).toEqual([]);
  });

  /**
   * The full lazy path: restore stubs the kind and kicks activation; the
   * placeholder renders "Starting extension…" while the extension wakes, then
   * the real view's registration swaps the stub and the tab shows real content.
   */
  it("activates the owning extension and swaps in its real tab view", async () => {
    const { bootstrap, activate, release } = fakeBootstrap();
    setExtensionBootstrap(bootstrap);

    storedState = {
      ...DEFAULT_DESKTOP_STATE,
      workspaceTabs: {
        "/vault": {
          openTabs: [staticTab("lazy-view.calendar", "Calendar")],
          activeTabId: "lazy-view.calendar"
        }
      }
    };
    windowRoot = "/vault";

    await openWindow();

    // Restore kicked activation of the kind's owner; while it is pending the
    // placeholder owns the kind, so the tab renders the lazy surface rather
    // than being dropped as unknown.
    expect(activate).toHaveBeenCalledWith("lazy-view");
    const stub = desktopTabRegistry.get("lazy-view.calendar");
    expect(stub?.placeholder).toBe(true);

    const rendered = await renderNode(
      stub?.factory?.({ rootPath: "/vault", tabId: "lazy-view.calendar" })
    );
    expect(rendered.textContent).toContain("Starting extension…");

    // What `activate` does: the extension registers its real view, which swaps
    // the placeholder out under the same kind.
    release();
    await act(async () => {
      desktopTabRegistry.register({
        kind: "lazy-view.calendar",
        label: "Calendar",
        isAvailable: true,
        factory: () => "real calendar view"
      });
    });

    expect(desktopTabRegistry.get("lazy-view.calendar")?.placeholder).toBeUndefined();
    expect(rendered.textContent).toContain("real calendar view");
  });
});
