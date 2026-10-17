// @vitest-environment happy-dom
/**
 * The workspace a window restores and switches to is opened by the shell's
 * workspace session, not by the explorer: no explorer is mounted here at all,
 * and the window still ends up with its workspace — or, when the workspace is
 * gone, with none.
 *
 * Mocked with `vi.mock` for the reason `useWorkspaceLifecycle.test.tsx` gives.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NativeWorkspaceSnapshot } from "../native/commands";
import type { DesktopState } from "../settings/desktopState";
import type { DesktopTabState } from "../tabs/tabModel";

let storedState: DesktopState;
let windowRoot: string | null = null;
let savedUpdates: Record<string, unknown>[] = [];
/** Per-root answers for `openWorkspace`; a root missing here rejects. */
let snapshots: Record<string, Promise<NativeWorkspaceSnapshot>> = {};
const indexed: string[] = [];

vi.mock("../native/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../native/runtime")>()),
  isNativeHost: () => true
}));
vi.mock("../settings/desktopState", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../settings/desktopState")>()),
  loadDesktopState: () => Promise.resolve(storedState),
  saveDesktopState: (update: Record<string, unknown>) => {
    savedUpdates.push(update);
    return Promise.resolve(storedState);
  }
}));
vi.mock("../workspace/workspaceAdapter", () => ({
  workspaceDesktopApi: {
    windowWorkspaceRoot: () => Promise.resolve(windowRoot),
    openWorkspace: (rootPath: string) =>
      snapshots[rootPath] ?? Promise.reject(new Error(`${rootPath} is gone`)),
    listWorkspaceEntries: () => Promise.resolve([])
  }
}));
vi.mock("../workspace/workspaceWatcher", () => ({ watchWorkspace: () => Promise.resolve(() => {}) }));
vi.mock("../events/noteChangeSubscription", () => ({ subscribeToNoteChanges: () => () => {} }));
vi.mock("../extensions/workspaceBridge", () => ({ setWorkspaceBridge: () => {}, getWorkspaceBridge: () => null }));
const indexStore = {
  getState: () => ({
    subscribeToEvents: () => () => {},
    indexWorkspace: (rootPath: string) => void indexed.push(rootPath),
    clearWorkspace: () => {},
    rootPath: null
  })
};
vi.mock("../search/searchIndexStore", () => ({ useSearchIndexStore: indexStore }));
vi.mock("../wikiLinks/wikiLinkIndexStore", () => ({ useWikiLinkIndexStore: indexStore }));
vi.mock("../settings/settingsStore", () => ({
  useSettingsStore: Object.assign(() => false, {
    getState: () => ({ loaded: true, workspaceRootPath: null, loadSettings: () => Promise.resolve() })
  })
}));
vi.mock("../settings/settingsRegistry", () => ({
  appSettingsRegistry: { register: () => ({ dispose: () => {} }), getDefinition: () => undefined }
}));

const { useWorkspaceLifecycle } = await import("./useWorkspaceLifecycle");
const { DEFAULT_DESKTOP_STATE } = await import("../settings/desktopState");

const NO_TABS: DesktopTabState = {
  tabs: [],
  activeTabId: null,
  closeRequest: null,
  history: { entries: [], cursor: -1, nextVisitId: 1 }
};
const snapshot = (rootPath: string): NativeWorkspaceSnapshot => ({
  workspace: { root_path: rootPath, name: rootPath.slice(1) },
  files: []
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let lifecycle: ReturnType<typeof useWorkspaceLifecycle> | null = null;
const current = () => {
  if (!lifecycle) throw new Error("the lifecycle did not render");
  return lifecycle;
};

/** Stable callbacks, built once: fresh ones per render would re-run the restore. */
const dispatchTabs = () => {};
const loadDocumentIntoView = () => {};
const openMarkdownDocument = () => {};

async function openWindow(): Promise<void> {
  function Host() {
    lifecycle = useWorkspaceLifecycle({ tabState: NO_TABS, dispatchTabs, loadDocumentIntoView, openMarkdownDocument });
    return null;
  }
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<Host />));
  await act(async () => undefined);
}

beforeEach(() => {
  storedState = DEFAULT_DESKTOP_STATE;
  windowRoot = null;
  savedUpdates = [];
  snapshots = {};
  indexed.length = 0;
  lifecycle = null;
});

/** Only the `lastWorkspacePath` writes — the debounced tab save is not under test. */
const lastPathUpdates = () => savedUpdates.filter((update) => "lastWorkspacePath" in update);

afterEach(async () => {
  lifecycle?.cancelDeferredPersistence();
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("the workspace session behind a window", () => {
  it("opens and indexes the window's own workspace with no explorer mounted", async () => {
    windowRoot = "/second";
    storedState = { ...DEFAULT_DESKTOP_STATE, lastWorkspacePath: "/first" };
    snapshots = { "/first": Promise.resolve(snapshot("/first")), "/second": Promise.resolve(snapshot("/second")) };

    await openWindow();

    expect(current().restoredWorkspacePath).toBe("/second");
    expect(current().workspaceName).toBe("second");
    expect(current().workspaceSession.phase).toBe("ready");
    expect(indexed).toContain("/second");
    expect(indexed).not.toContain("/first");
  });

  it("gives up a restored workspace that is gone, and forgets it as the last one", async () => {
    storedState = { ...DEFAULT_DESKTOP_STATE, lastWorkspacePath: "/gone" };

    await openWindow();

    expect(current().restoredWorkspacePath).toBeNull();
    expect(current().workspaceName).toBeNull();
    expect(current().workspaceSession.phase).toBe("error");
    expect(lastPathUpdates().at(-1)).toEqual({ lastWorkspacePath: null });
  });

  it("ends an in-window switch on the last workspace asked for, whatever resolves first", async () => {
    let finishSlow!: (value: NativeWorkspaceSnapshot) => void;
    snapshots = {
      "/slow": new Promise((resolve) => {
        finishSlow = resolve;
      }),
      "/fast": Promise.resolve(snapshot("/fast"))
    };
    await openWindow();

    let slow: Promise<void> | undefined;
    await act(async () => {
      slow = current().openWorkspaceInWindow("/slow");
    });
    await act(async () => {
      await current().openWorkspaceInWindow("/fast");
    });
    await act(async () => {
      finishSlow(snapshot("/slow"));
      await slow;
    });

    expect(current().restoredWorkspacePath).toBe("/fast");
    expect(current().workspaceName).toBe("fast");
    expect(lastPathUpdates().at(-1)).toEqual({ lastWorkspacePath: "/fast" });
    expect(indexed).not.toContain("/slow");
  });
});
