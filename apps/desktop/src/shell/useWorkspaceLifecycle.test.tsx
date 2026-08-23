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
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DesktopState, WorkspaceTabsUpdate } from "../settings/desktopState";
import type { DesktopTabAction, DesktopTabState } from "../tabs/tabModel";

/** What `loadDesktopState` will answer with, set per test. */
let storedState: DesktopState;
/** What the native side says this window's workspace is, set per test. */
let windowRoot: string | null = null;
/** Every targeted tab update the hook persisted. */
let savedTabs: WorkspaceTabsUpdate[] = [];

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
vi.mock("../extensions/workspaceBridge", () => ({ setWorkspaceBridge: () => {} }));

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
  })
}));

const { useWorkspaceLifecycle } = await import("./useWorkspaceLifecycle");
const { DEFAULT_DESKTOP_STATE } = await import("../settings/desktopState");

const NO_TABS: DesktopTabState = { tabs: [], activeTabId: null, closeRequest: null };

const tab = (root: string, note: string) => ({
  id: `editor:${root}:${note}`,
  title: note,
  kind: "editor",
  rootPath: root,
  relativePath: note
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  storedState = DEFAULT_DESKTOP_STATE;
  windowRoot = null;
  savedTabs = [];
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
    useWorkspaceLifecycle({
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
      closeRequest: null
    } as DesktopTabState);

    // Debounced, so the write lands after the delay rather than on mount.
    await settle(TAB_PERSIST_DELAY_MS + 50);

    expect(savedTabs.length).toBeGreaterThan(0);
    for (const saved of savedTabs) {
      expect(saved.workspacePath).toBe("/vault-b");
    }
    expect(savedTabs.at(-1)?.openTabs.map((t) => t.relativePath)).toEqual(["b.md"]);
  });
});
