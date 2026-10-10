// @vitest-environment happy-dom
/**
 * What a restored tab needs beyond its strip entry.
 *
 * The case that matters here shipped as a bug: reopening the app rebuilt every
 * persisted tab but only re-read the document for Markdown editors. A restored
 * code file sat on "Loading file" forever — the document keyed by its tab id
 * never arrived. Media viewers have no document state (they read via the asset
 * protocol), so they must not trigger a load either.
 *
 * Mounting the lifecycle hook needs its modules mocked with `vi.mock`, not
 * `vi.spyOn` — ESM exports are not writable under Vite.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DesktopState } from "../settings/desktopState";
import type { DesktopTabAction, DesktopTabState } from "./tabModel";
import { fileTabId, initialDesktopTabState } from "./tabModel";

/** What `loadDesktopState` will answer with, set per test. */
let storedState: DesktopState;
let windowRoot: string | null = null;

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
    saveDesktopState: () => Promise.resolve(storedState)
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

const { useWorkspaceLifecycle } = await import("../shell/useWorkspaceLifecycle");
const { DEFAULT_DESKTOP_STATE } = await import("../settings/desktopState");

const NO_TABS: DesktopTabState = initialDesktopTabState;

/** The callbacks the shell hands the hook, captured for assertions. */
interface MountResult {
  readonly loads: readonly (readonly [string, string, string, string | undefined])[];
  readonly actions: readonly DesktopTabAction[];
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  storedState = DEFAULT_DESKTOP_STATE;
  windowRoot = null;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

/**
 * Mounts the hook as one window and reports which tabs it opened and which
 * documents it asked to load. Callbacks are stable across renders — fresh
 * closures would re-run the restore effect forever.
 */
async function openWindow(tabState: DesktopTabState = NO_TABS): Promise<MountResult> {
  const loads: [string, string, string, string | undefined][] = [];
  const actions: DesktopTabAction[] = [];
  const dispatchTabs = (action: DesktopTabAction) => {
    actions.push(action);
  };
  const loadDocumentIntoView = (tabId: string, rootPath: string, relativePath: string, kind?: string) => {
    loads.push([tabId, rootPath, relativePath, kind]);
  };
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
  return { loads, actions };
}

const persistedFileTab = (root: string, relativePath: string, kind: string) => ({
  id: fileTabId({ rootPath: root, relativePath }),
  title: relativePath,
  kind,
  rootPath: root,
  relativePath
});

describe("restoring tabs that are not Markdown notes", () => {
  it("loads the document for a restored code-editor tab", async () => {
    storedState = {
      ...DEFAULT_DESKTOP_STATE,
      workspaceTabs: {
        "/vault": {
          openTabs: [persistedFileTab("/vault", "src/app.py", "code-editor")],
          activeTabId: null
        }
      }
    };
    windowRoot = "/vault";

    const { loads } = await openWindow();

    expect(loads).toEqual([
      [fileTabId({ rootPath: "/vault", relativePath: "src/app.py" }), "/vault", "src/app.py", "code-editor"]
    ]);
  });

  it("loads documents for an editor and a code-editor restored together", async () => {
    storedState = {
      ...DEFAULT_DESKTOP_STATE,
      workspaceTabs: {
        "/vault": {
          openTabs: [
            persistedFileTab("/vault", "note.md", "editor"),
            persistedFileTab("/vault", "config.json", "code-editor")
          ],
          activeTabId: null
        }
      }
    };
    windowRoot = "/vault";

    const { loads } = await openWindow();

    expect(loads.map(([tabId]) => tabId)).toEqual([
      fileTabId({ rootPath: "/vault", relativePath: "note.md" }),
      fileTabId({ rootPath: "/vault", relativePath: "config.json" })
    ]);
  });

  it("does not ask for a document for a restored media viewer tab", async () => {
    storedState = {
      ...DEFAULT_DESKTOP_STATE,
      workspaceTabs: {
        "/vault": {
          openTabs: [persistedFileTab("/vault", "assets/logo.png", "image-viewer")],
          activeTabId: null
        }
      }
    };
    windowRoot = "/vault";

    const { loads, actions } = await openWindow();

    // The tab itself still restores — it just has no document to read.
    expect(actions.some((action) => action.type === "open")).toBe(true);
    expect(loads).toEqual([]);
  });
});
