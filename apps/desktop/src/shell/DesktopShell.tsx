import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { CommandPalette, type WorkspaceFileResult } from "../commands/CommandPalette";
import {
  useDesktopCommands,
  type DesktopCommand,
  type DesktopCommandContext
} from "../commands/commandRegistry";
import { appEvents } from "../events/appEvents";
import { setWorkspaceBridge } from "../extensions/workspaceBridge";
import { gitService } from "../git/gitService";
import { BottomPanel as BottomPanelContent } from "../panels/BottomPanel";
import { LeftPopout } from "../panels/LeftPopout";
import { RightPopout } from "../panels/RightPopout";
import type { NativeMarkdownFileEntry, NativeWorkspaceSnapshot } from "../native/commands";
import {
  clampPanelWidth,
  DEFAULT_DESKTOP_STATE,
  DEFAULT_LEFT_PANEL_WIDTH,
  DEFAULT_RIGHT_PANEL_WIDTH,
  loadDesktopState,
  promoteRecentWorkspace,
  saveDesktopState,
  type DesktopStateUpdate,
  type PersistedTab
} from "../settings/desktopState";
import { useTheme } from "../settings/theme-context";
import { useSearchIndexStore } from "../search/searchIndexStore";
import { useSettingsStore } from "../settings/settingsStore";
import { useWikiLinkIndexStore } from "../wikiLinks/wikiLinkIndexStore";
import { releaseEditorStatesExcept } from "../tabs/editorStateCache";
import {
  createEditorTab,
  createStaticTab,
  desktopTabReducer,
  editorTabId,
  initialDesktopTabState,
  type DesktopTab,
  type DesktopTabState
} from "../tabs/tabModel";
import { desktopTabRegistry } from "../tabs/tabRegistry";
import { subscribeToNoteChanges } from "../events/noteChangeSubscription";
import { workspaceDocumentApi } from "../workspace/workspaceDocumentAdapter";
import { workspaceDesktopApi } from "../workspace/workspaceAdapter";
import { loadWorkspaceDocument, saveWorkspaceDocument } from "../workspace/workspaceDocumentModel";
import { watchWorkspace } from "../workspace/workspaceWatcher";
import { addWorkspaceFile, removeWorkspaceFile } from "./workspaceFileList";
import {
  anchorDiskContents,
  applyRefusedSave,
  applyReloadedDocument,
  applySavedDocument,
  clearConflict,
  markConflict,
  moveDocumentView,
  NOTE_CONFLICT_ERROR_CODE,
  planDocumentSync,
  pruneConflicts,
  saveablePrecondition,
  type OpenDocument
} from "./externalDocumentSync";
import { ActivityBar } from "./ActivityBar";
import { DirtyCloseDialog } from "./DirtyCloseDialog";
import { ResizeHandle } from "./ResizeHandle";
import { StaleDocumentBanner } from "./StaleDocumentBanner";
import { createDebounced, type Debounced } from "../lib/debounce";
import { isBuiltInLeftPanel } from "../panels/panelRegistry";
import { isSelectableRightPanel, type BottomPanel, type DocumentViewState, type LeftPanel, type RightPanel } from "./shellTypes";
import { StatusBar } from "./StatusBar";
import { TabContent } from "./TabContent";
import { TitleBar } from "./TitleBar";

type PanelSide = "left" | "right";

/** How long a burst of tab opens and closes settles before it is written down. */
const TAB_PERSIST_DELAY_MS = 400;

/** How long a drag settles before its final width is written down. */
const PANEL_WIDTH_PERSIST_DELAY_MS = 300;

export function DesktopShell() {
  const paletteCommands = useDesktopCommands();
  const rootRef = useRef<HTMLElement>(null);
  const [tabState, dispatchTabs] = useReducer(desktopTabReducer, initialDesktopTabState);
  const [documents, setDocuments] = useState<Record<string, DocumentViewState>>({});
  const documentsRef = useRef(documents);
  // Tabs whose file changed on disk while they held unsaved edits, waiting on
  // the user to choose between the two versions.
  const [conflicts, setConflicts] = useState<ReadonlySet<string>>(new Set());
  // Read by the outside-change subscription, which outlives any one set of
  // tabs and must not be rebuilt every time one opens or closes.
  const tabStateRef = useRef(tabState);
  const paletteRestoreFocusRef = useRef<HTMLElement | null>(null);
  const [leftPanel, setLeftPanel] = useState<LeftPanel | null>("explorer");
  const [rightPanel, setRightPanel] = useState<RightPanel | null>(null);
  const [bottomPanel, setBottomPanel] = useState<BottomPanel | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT_PANEL_WIDTH);
  const [rightWidth, setRightWidth] = useState(DEFAULT_RIGHT_PANEL_WIDTH);
  const leftWidthRef = useRef(leftWidth);
  const rightWidthRef = useRef(rightWidth);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const [restoredWorkspacePath, setRestoredWorkspacePath] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [workspaceFiles, setWorkspaceFiles] = useState<readonly NativeMarkdownFileEntry[]>([]);
  const [recentWorkspacePaths, setRecentWorkspacePaths] = useState<readonly string[]>([]);
  const recentWorkspacePathsRef = useRef<readonly string[]>([]);
  const [newNoteFocusRequest, setNewNoteFocusRequest] = useState(0);
  const [stateRestored, setStateRestored] = useState(!isTauri());
  const tabsRestoredRef = useRef(false);

  // Subscribe to the settings store's dirty flag so the settings tab shows the
  // dirty dot when staged changes exist. This re-renders DesktopShell when
  // isDirty changes, which is acceptable (infrequent, boolean toggle).
  const settingsIsDirty = useSettingsStore((s) => s.isDirty);

  // Wiki-link note index for resolving `[[Target]]` links in the editor.
  const noteIndex = useWikiLinkIndexStore((s) => s.noteIndex);

  useEffect(() => {
    documentsRef.current = documents;
  }, [documents]);

  useEffect(() => {
    tabStateRef.current = tabState;
  }, [tabState]);

  // Clean up document view-state entries when their tabs are closed. The tab
  // reducer (`removeTab`) only drops the tab from the tabs array; the documents
  // map is owned here, so orphaned entries (full note contents) would otherwise
  // leak indefinitely as users open and close notes. Adjusting state during
  // render (with a guard) is the React-recommended pattern for derived state.
  const openTabIds = useMemo(
    () => new Set(tabState.tabs.map((tab) => tab.id)),
    [tabState.tabs]
  );
  const hasOrphanedDocs = Object.keys(documents).some((id) => !openTabIds.has(id));
  if (hasOrphanedDocs) {
    const next: Record<string, DocumentViewState> = {};
    for (const [id, view] of Object.entries(documents)) {
      if (openTabIds.has(id)) next[id] = view;
    }
    setDocuments(next);
  }

  // The same cleanup for conflict flags. A closed tab cannot answer, and the
  // flag would come back to life if the same file were reopened — a tab's id is
  // built from its path.
  const prunedConflicts = pruneConflicts(conflicts, openTabIds);
  if (prunedConflicts !== conflicts) setConflicts(prunedConflicts);

  // The same cleanup for what the editors themselves parked. An unmount cannot
  // tell a switch away from a close, so the editor parks its cursor and undo
  // history either way and the shell — which knows which tabs are left — drops
  // the ones nobody can return to.
  useEffect(() => {
    releaseEditorStatesExcept(openTabIds);
  }, [openTabIds]);



  // Whether a settings tab is currently open. Derived once so the dirty-sync
  // effect below can depend on a stable boolean instead of the entire `tabs`
  // array reference — otherwise opening/closing unrelated tabs (which always
  // produces a new array) would re-run the effect and dispatch a redundant
  // `setDirty` even though neither the settings dirty flag nor settings-tab
  // presence changed.
  const hasSettingsTab = tabState.tabs.some((tab) => tab.id === "settings");

  // Mirror the settings store's dirty flag into the tab system so the settings
  // tab shows the dirty dot and triggers DirtyCloseDialog on close. Only
  // dispatches when a settings tab is actually open to avoid spurious actions.
  useEffect(() => {
    if (!hasSettingsTab) return;
    dispatchTabs({ type: "setDirty", tabId: "settings", isDirty: settingsIsDirty });
  }, [settingsIsDirty, hasSettingsTab]);

  const updateRecentWorkspacePaths = useCallback((rootPath: string): readonly string[] => {
    const next = promoteRecentWorkspace(recentWorkspacePathsRef.current, rootPath);
    recentWorkspacePathsRef.current = next;
    setRecentWorkspacePaths(next);
    return next;
  }, []);

  /**
   * Loads a workspace document into the documents view-state map. Shared by
   * `openMarkdownDocument` (live opens) and the tab-restore effect (restart).
   * The caller is responsible for dispatching the tab and, for live opens,
   * emitting `note.opened`.
   */
  const loadDocumentIntoView = useCallback(
    (tabId: string, rootPath: string, relativePath: string) => {
      setDocuments((current) => ({
        ...current,
        [tabId]: { phase: "loading", contents: "", diskContents: null, error: null }
      }));
      void loadWorkspaceDocument(workspaceDocumentApi, { rootPath, relativePath }).then(
        (result) => {
          setDocuments((current) => ({
            ...current,
            [tabId]: result.ok
              ? {
                  phase: "ready",
                  contents: result.document.contents,
                  diskContents: result.document.contents,
                  error: null
                }
              : { phase: "error", contents: "", diskContents: null, error: result.message }
          }));
        }
      );
    },
    []
  );

  /**
   * Re-reads a note that changed on disk into the tab already showing it.
   *
   * Unlike `loadDocumentIntoView` this never blanks the tab first: the tab has
   * readable text now, and flashing it empty to fetch text it probably still
   * has would be worse than the staleness being fixed. A failed read leaves the
   * tab as it is for the same reason.
   */
  const reloadDocumentInPlace = useCallback(
    (tabId: string, rootPath: string, relativePath: string) => {
      const expectedContents = documentsRef.current[tabId]?.contents ?? "";
      void loadWorkspaceDocument(workspaceDocumentApi, { rootPath, relativePath }).then(
        (result) => {
          if (!result.ok) return;
          setDocuments((current) =>
            applyReloadedDocument(current, tabId, expectedContents, result.document.contents)
          );
        }
      );
    },
    []
  );

  // Restore the persisted desktop state (last workspace, recents, explorer
  // visibility) plus the workspace root the native window was launched with.
  useEffect(() => {
    if (!isTauri()) return;

    let active = true;
    void Promise.allSettled([loadDesktopState(), workspaceDesktopApi.windowWorkspaceRoot()]).then(([desktopResult, rootResult]) => {
      if (!active) return;
      const desktopState = desktopResult.status === "fulfilled" ? desktopResult.value : DEFAULT_DESKTOP_STATE;
      const windowRoot = rootResult.status === "fulfilled" ? rootResult.value : null;
      const recentPaths = windowRoot
        ? promoteRecentWorkspace(desktopState.recentWorkspacePaths, windowRoot)
        : desktopState.recentWorkspacePaths;
      setRestoredWorkspacePath(windowRoot ?? desktopState.lastWorkspacePath);
      recentWorkspacePathsRef.current = recentPaths;
      setRecentWorkspacePaths(recentPaths);
      setLeftPanel(desktopState.explorerOpen ? "explorer" : null);
      leftWidthRef.current = desktopState.leftPanelWidth;
      rightWidthRef.current = desktopState.rightPanelWidth;
      setLeftWidth(desktopState.leftPanelWidth);
      setRightWidth(desktopState.rightPanelWidth);
      setBottomPanel(desktopState.bottomPanelOpen ? "terminal" : null);

      // Restore persisted tabs once. Guarded by a ref because StrictMode
      // double-mounts effects in dev — without this, tabs would open twice.
      if (!tabsRestoredRef.current && desktopState.openTabs.length > 0) {
        tabsRestoredRef.current = true;
        const rootPath = windowRoot ?? desktopState.lastWorkspacePath;
        for (const persisted of desktopState.openTabs) {
          const tab = restoreTab(persisted, rootPath);
          if (tab) {
            dispatchTabs({ type: "open", tab });
            if (tab.kind === "editor" && tab.resource?.rootPath && tab.resource?.relativePath) {
              loadDocumentIntoView(tab.id, tab.resource.rootPath, tab.resource.relativePath);
            }
          }
        }
        if (desktopState.activeTabId) {
          dispatchTabs({ type: "activate", tabId: desktopState.activeTabId });
        }
      }
    }).finally(() => {
      if (active) setStateRestored(true);
    });

    return () => {
      active = false;
    };
  }, [loadDocumentIntoView]);

  // Other windows can append to the recent workspace list, so refresh it
  // whenever this window regains focus.
  useEffect(() => {
    if (!isTauri()) return;

    let active = true;
    const refreshRecentWorkspacePaths = () => {
      void loadDesktopState().then((desktopState) => {
        if (!active) return;
        recentWorkspacePathsRef.current = desktopState.recentWorkspacePaths;
        setRecentWorkspacePaths(desktopState.recentWorkspacePaths);
      }).catch(() => undefined);
    };

    window.addEventListener("focus", refreshRecentWorkspacePaths);
    return () => {
      active = false;
      window.removeEventListener("focus", refreshRecentWorkspacePaths);
    };
  }, []);

  const persistDesktopState = useCallback((update: DesktopStateUpdate) => {
    if (!isTauri()) return;
    void saveDesktopState(update).catch(() => undefined);
  }, []);

  /**
   * Debounced tab persistence: writes the open tab list and active tab id
   * whenever tabs change, coalescing rapid open/close bursts into one write.
   * Skipped until state restoration completes so restored tabs don't
   * immediately trigger a redundant save.
   */
  const saveTabs = useMemo(
    () =>
      createDebounced<DesktopTabState>((tabs) => {
        persistDesktopState({
          openTabs: tabs.tabs.map(tabToPersisted),
          activeTabId: tabs.activeTabId
        });
      }, TAB_PERSIST_DELAY_MS),
    [persistDesktopState]
  );
  useEffect(() => {
    if (!stateRestored || !isTauri()) return;
    saveTabs(tabState);
  }, [saveTabs, stateRestored, tabState]);

  /**
   * Coalesces rapid resize updates so a drag writes its final width once rather
   * than rewriting the app-settings file for every pointer movement.
   */
  const savePanelWidth = useMemo(
    (): Record<PanelSide, Debounced<number>> => ({
      left: createDebounced<number>(
        (width) => persistDesktopState({ leftPanelWidth: width }),
        PANEL_WIDTH_PERSIST_DELAY_MS
      ),
      right: createDebounced<number>(
        (width) => persistDesktopState({ rightPanelWidth: width }),
        PANEL_WIDTH_PERSIST_DELAY_MS
      )
    }),
    [persistDesktopState]
  );
  const schedulePanelWidthPersistence = useCallback(
    (side: PanelSide, width: number) => savePanelWidth[side](width),
    [savePanelWidth]
  );

  /** Applies and schedules persistence for a safe dock width. */
  const updatePanelWidth = useCallback((side: PanelSide, requestedWidth: number) => {
    const width = clampPanelWidth(requestedWidth);
    if (side === "left") {
      leftWidthRef.current = width;
      setLeftWidth(width);
    } else {
      rightWidthRef.current = width;
      setRightWidth(width);
    }
    schedulePanelWidthPersistence(side, width);
  }, [schedulePanelWidthPersistence]);

  /** Restores the side-specific dock width used by a double-clicked divider. */
  const resetPanelWidth = useCallback((side: PanelSide) => {
    updatePanelWidth(
      side,
      side === "left" ? DEFAULT_LEFT_PANEL_WIDTH : DEFAULT_RIGHT_PANEL_WIDTH
    );
  }, [updatePanelWidth]);

  const updateBottomPanel = useCallback((panel: BottomPanel | null) => {
    setBottomPanel(panel);
    persistDesktopState({ bottomPanelOpen: panel !== null });
  }, [persistDesktopState]);

  const toggleBottomPanel = useCallback(() => {
    updateBottomPanel(bottomPanel ? null : "terminal");
  }, [bottomPanel, updateBottomPanel]);

  // Cancel deferred writes and an active drag if the shell unmounts.
  useEffect(() => () => {
    savePanelWidth.left.cancel();
    savePanelWidth.right.cancel();
    saveTabs.cancel();
    resizeCleanupRef.current?.();
  }, [savePanelWidth, saveTabs]);

  const selectLeftPanel = useCallback((target: LeftPanel) => {
    setLeftPanel((panel) => {
      const next = panel === target ? null : target;
      persistDesktopState({ explorerOpen: next === "explorer" });
      return next;
    });
  }, [persistDesktopState]);

  const handleWorkspaceOpened = useCallback((rootPath: string, snapshot: NativeWorkspaceSnapshot) => {
    setRestoredWorkspacePath(rootPath);
    setWorkspaceName(snapshot.workspace.name);
    setWorkspaceFiles(snapshot.files);
    const recentPaths = updateRecentWorkspacePaths(rootPath);
    void gitService.detectRepository(rootPath);
    void useSearchIndexStore.getState().indexWorkspace(rootPath, snapshot.files);
    void useWikiLinkIndexStore.getState().indexWorkspace(rootPath, snapshot.files);
    persistDesktopState({ lastWorkspacePath: rootPath, recentWorkspacePaths: recentPaths });
  }, [persistDesktopState, updateRecentWorkspacePaths]);

  const handleWorkspaceUnavailable = useCallback(() => {
    setRestoredWorkspacePath(null);
    setWorkspaceName(null);
    setWorkspaceFiles([]);
    useSearchIndexStore.getState().clearWorkspace();
    useWikiLinkIndexStore.getState().clearWorkspace();
    persistDesktopState({ lastWorkspacePath: null });
  }, [persistDesktopState]);

  const handleWorkspaceLaunched = useCallback((rootPath: string) => {
    const recentPaths = updateRecentWorkspacePaths(rootPath);
    // Persist `lastWorkspacePath` so a fresh window (or a window whose native
    // root query returns null) can restore to the most recently launched
    // workspace. In multi-window Tauri sessions, `window_workspace_root`
    // takes precedence over this fallback on reload.
    persistDesktopState({ lastWorkspacePath: rootPath, recentWorkspacePaths: recentPaths });
  }, [persistDesktopState, updateRecentWorkspacePaths]);

  const openPalette = useCallback(() => {
    paletteRestoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPaletteOpen(true);
  }, []);

  const closePalette = useCallback((restoreFocus = true) => {
    setPaletteOpen(false);
    if (restoreFocus) queueMicrotask(() => paletteRestoreFocusRef.current?.focus());
  }, []);

  const showExplorer = useCallback(() => {
    setLeftPanel("explorer");
    persistDesktopState({ explorerOpen: true });
  }, [persistDesktopState]);

  const openSettingsTab = useCallback(() => {
    dispatchTabs({ type: "open", tab: createStaticTab("settings", "Settings") });
  }, []);

  const acknowledgeNewNoteFocus = useCallback(() => {
    setNewNoteFocusRequest(0);
  }, []);

  const openMarkdownDocument = useCallback((rootPath: string, relativePath: string) => {
    const tab = createEditorTab({ rootPath, relativePath });
    dispatchTabs({ type: "open", tab });
    appEvents.emit("note.opened", { rootPath, relativePath });

    if (documentsRef.current[tab.id]) return;
    loadDocumentIntoView(tab.id, rootPath, relativePath);
  }, [loadDocumentIntoView]);

  // Opens a note by vault-relative path when a wiki link is clicked. Delegates
  // to `openMarkdownDocument` with the current workspace root.
  const onOpenNote = useCallback(
    (relativePath: string) => {
      if (!restoredWorkspacePath) return;
      openMarkdownDocument(restoredWorkspacePath, relativePath);
    },
    [restoredWorkspacePath, openMarkdownDocument]
  );

  // Publishes the workspace surface extensions use. The root, the tabs, and the
  // documents are all React state here, so the bridge is republished whenever
  // the root changes and withdrawn on unmount — an extension calling into a
  // stale shell would open a tab nobody renders.
  useEffect(() => {
    setWorkspaceBridge({
      rootPath: restoredWorkspacePath,
      openNote: (relativePath) => {
        if (!restoredWorkspacePath) return;
        openMarkdownDocument(restoredWorkspacePath, relativePath);
      },
      openTab: (kind, title) => {
        dispatchTabs({ type: "open", tab: createStaticTab(kind, title) });
      }
    });
    return () => setWorkspaceBridge(null);
  }, [restoredWorkspacePath, openMarkdownDocument]);

  // Reload settings whenever the workspace root changes so the settings store
  // knows the workspace root path. Without this, workspace-scoped settings
  // (like journal fieldDefinitions) are unsaveable when the user hasn't opened
  // the Settings tab — `workspaceRootPath` stays null from ThemeProvider's
  // initial `loadSettings(null)`, and `saveSettings` silently strands every
  // workspace-scoped write in `stagedChanges` without persisting anything.
  // SettingsTab has its own guard that skips the reload if the root matches.
  useEffect(() => {
    if (!isTauri()) return;
    const { loaded, workspaceRootPath } = useSettingsStore.getState();
    if (loaded && workspaceRootPath === restoredWorkspacePath) return;
    void useSettingsStore.getState().loadSettings(restoredWorkspacePath);
  }, [restoredWorkspacePath]);

  // Subscribe the search index to note mutation events for incremental updates.
  // The store's actions are workspace-scoped, so events from other windows are ignored.
  useEffect(() => useSearchIndexStore.getState().subscribeToEvents(), []);
  // Subscribe the wiki-link index to note mutation events for incremental updates.
  // The store's actions are workspace-scoped, so events from other windows are ignored.
  useEffect(() => useWikiLinkIndexStore.getState().subscribeToEvents(), []);

  // Index the restored workspace for search and wiki-links even when the
  // explorer panel is closed. Without this, `indexWorkspace` is only called
  // from `handleWorkspaceOpened`, which fires via the WorkspaceExplorer's mount
  // effect — so closing the explorer before restart leaves both indexes empty.
  // The store's `rootPath` guard prevents double-indexing when the explorer is
  // also open and has already triggered `handleWorkspaceOpened`.
  useEffect(() => {
    if (!isTauri() || !restoredWorkspacePath) return;
    const rootPath = restoredWorkspacePath;
    const { rootPath: wikiRoot } = useWikiLinkIndexStore.getState();
    if (wikiRoot === rootPath) return;
    // Switching workspaces while this read is in flight must not index the old
    // one over the new. `indexWorkspace` stamps its own root before checking
    // anything, so its internal guards cannot reject a stale caller — the
    // caller has to not call. Without this, a late listing for the previous
    // vault leaves both indexes holding its notes under its root, and every
    // later note event for the current vault is dropped by the root guards.
    let cancelled = false;
    void workspaceDesktopApi.openWorkspace(rootPath).then((snapshot) => {
      if (cancelled) return;
      // The explorer may have indexed this same workspace in the meantime.
      if (useWikiLinkIndexStore.getState().rootPath === rootPath) return;
      void useSearchIndexStore.getState().indexWorkspace(rootPath, snapshot.files);
      void useWikiLinkIndexStore.getState().indexWorkspace(rootPath, snapshot.files);
    });
    return () => {
      cancelled = true;
    };
  }, [restoredWorkspacePath]);

  // Watch the open workspace for edits the app did not make. Both indexes and
  // the calendar are caches of this folder, and until now only in-app writes
  // refreshed them — a `git pull`, a sync client or another editor left them
  // confidently wrong until the workspace was reopened. The watcher republishes
  // outside changes as the same `note.*` events an in-app edit produces, so
  // every consumer stays as it was.
  useEffect(() => {
    if (!isTauri() || !restoredWorkspacePath) return;
    const rootPath = restoredWorkspacePath;
    let cancelled = false;
    let stop: (() => void) | null = null;

    // A change the watcher cannot name path by path — a deleted folder takes
    // its notes with it and the OS reports only the folder — so the caches are
    // rebuilt from what is actually on disk.
    const rebuildFromDisk = () => {
      void workspaceDesktopApi.openWorkspace(rootPath).then((snapshot) => {
        if (cancelled) return;
        setWorkspaceFiles(snapshot.files);
        void useSearchIndexStore.getState().indexWorkspace(rootPath, snapshot.files);
        void useWikiLinkIndexStore.getState().indexWorkspace(rootPath, snapshot.files);
      });
    };

    void watchWorkspace(rootPath, rebuildFromDisk)
      .then((dispose) => {
        // The workspace can close while the watch is being set up.
        if (cancelled) {
          dispose();
          return;
        }
        stop = dispose;
      })
      .catch((error: unknown) => {
        // Watching is an enhancement over the previous behaviour, not a
        // prerequisite for it. Failing to watch costs freshness, so say so
        // rather than leaving the user to wonder why edits are not showing up.
        console.warn(
          "[watcher] Edits made outside the app will not be picked up automatically.",
          error
        );
      });

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [restoredWorkspacePath]);

  // Keep open editor tabs level with the files they are showing. A tab is a
  // copy of a file taken when it opened, and nothing used to tell the shell
  // that copy had gone stale — a note edited in another program stayed on
  // screen as it was, and saving from that tab put the old text back over the
  // newer file.
  useEffect(() => {
    if (!restoredWorkspacePath) return;
    const rootPath = restoredWorkspacePath;

    return subscribeToNoteChanges(
      () => rootPath,
      (change) => {
        // A tab is identified by the path of its file, so a rename moves the
        // tab rather than changing what it holds. This is not only about
        // outside renames: renaming from the explorer left the tab pointing at
        // a path nothing lived at, and saving it recreated the old file.
        if (change.kind === "renamed") {
          const from = { rootPath, relativePath: change.oldRelativePath };
          const to = { rootPath, relativePath: change.newRelativePath };
          const fromTabId = editorTabId(from);
          if (!tabStateRef.current.tabs.some((tab) => tab.id === fromTabId)) return;
          setDocuments((current) => moveDocumentView(current, fromTabId, editorTabId(to)));
          dispatchTabs({ type: "retarget", from, to });
          return;
        }

        const openDocuments: readonly OpenDocument[] = tabStateRef.current.tabs.flatMap((tab) => {
          const resource = tab.resource;
          if (tab.kind !== "editor" || !resource?.rootPath || !resource.relativePath) return [];
          return [
            {
              tabId: tab.id,
              rootPath: resource.rootPath,
              relativePath: resource.relativePath,
              isDirty: Boolean(tab.isDirty)
            }
          ];
        });

        for (const action of planDocumentSync(openDocuments, change)) {
          if (action.kind === "conflict") {
            setConflicts((current) => markConflict(current, action.tabId));
            continue;
          }
          reloadDocumentInPlace(action.tabId, action.rootPath, action.relativePath);
        }
      }
    );
  }, [reloadDocumentInPlace, restoredWorkspacePath]);

  const handleMarkdownFileCreated = useCallback((rootPath: string, relativePath: string) => {
    if (rootPath !== restoredWorkspacePath) return;
    setWorkspaceFiles((files) => addWorkspaceFile(files, relativePath));
  }, [restoredWorkspacePath]);

  // Keep the shell's file list level with the folder. The indexes hear about
  // notes through their own subscriptions, but this list is separate state and
  // backs the command palette — so without this an externally created note is
  // searchable yet unopenable from the palette, and a deleted one stays listed.
  // Both in-app and outside changes arrive here, since they are the same events.
  useEffect(() => {
    if (!restoredWorkspacePath) return;
    const rootPath = restoredWorkspacePath;

    return subscribeToNoteChanges(
      () => rootPath,
      (change) => {
        switch (change.kind) {
          case "created":
            setWorkspaceFiles((files) => addWorkspaceFile(files, change.relativePath));
            break;
          case "deleted":
            setWorkspaceFiles((files) => removeWorkspaceFile(files, change.relativePath));
            break;
          case "renamed":
            setWorkspaceFiles((files) =>
              addWorkspaceFile(
                removeWorkspaceFile(files, change.oldRelativePath),
                change.newRelativePath
              )
            );
            break;
          case "saved":
            // The list holds names, and a save does not change one.
            break;
        }
      }
    );
  }, [restoredWorkspacePath]);

  /**
   * Flips `editor.livePreview` and persists it straight away.
   *
   * Read through the store's one-shot getter rather than a subscription: the
   * shell only needs the value at the moment the command fires.
   */
  const toggleLivePreview = useCallback(() => {
    const store = useSettingsStore.getState();
    const current = store.getEffectiveValue("editor.livePreview") !== false;
    void store.setSettingImmediately("editor.livePreview", !current);
  }, []);

  /** Executes a registered command with shell effects, keeping the registry canonical. */
  const handlePaletteCommand = useCallback((command: DesktopCommand) => {
    const context: DesktopCommandContext = {
      showExplorer,
      focusNewNote: () => setNewNoteFocusRequest((request) => request + 1),
      openSearch: () => {
        setLeftPanel("search");
        persistDesktopState({ explorerOpen: false });
      },
      toggleTheme: () => setTheme(theme === "dark" ? "light" : "dark"),
      toggleExplorer: () => selectLeftPanel("explorer"),
      toggleOutline: () => setRightPanel((panel) => panel === "outline" ? null : "outline"),
      toggleAssistant: () => setRightPanel((panel) => panel === "assistant" ? null : "assistant"),
      toggleBottomPanel,
      toggleLivePreview,
      // `panelId` is an unconstrained string at this boundary (see
      // `DesktopCommandContext`) so any extension can reveal a panel it
      // registered; narrow it against the live registry before it reaches
      // `RightPanel` shell state, so a typo or a stale id from a deactivated
      // extension is dropped instead of persisting as an id nothing renders.
      revealPanel: (panelId: string) => {
        if (isSelectableRightPanel(panelId)) setRightPanel(panelId);
      },
      // Narrow the unconstrained string against the live left-panel registry
      // before it reaches shell state, mirroring `revealPanel`'s guard for the
      // right side. A typo or stale id from a deactivated extension is dropped
      // instead of persisting as an id nothing renders.
      revealLeftPanel: (panelId: string) => {
        if (isBuiltInLeftPanel(panelId)) selectLeftPanel(panelId);
      },
      openSettings: openSettingsTab,
      rebuildIndex: () => updateBottomPanel("terminal"),
      closePalette
    };
    void Promise.resolve()
      .then(() => command.handler(context))
      .catch((error: unknown) => {
        console.error(`[commandRegistry] Command "${command.id}" failed.`, error);
      });
  }, [closePalette, openSettingsTab, persistDesktopState, selectLeftPanel, setTheme, showExplorer, theme, toggleBottomPanel, toggleLivePreview, updateBottomPanel]);

  const updateDocument = useCallback((tabId: string, contents: string) => {
    setDocuments((current) => {
      const document = current[tabId];
      return document ? { ...current, [tabId]: { ...document, contents, error: null } } : current;
    });
    dispatchTabs({ type: "setDirty", tabId, isDirty: true });
  }, []);

  /**
   * Persists a tab's document to disk.
   *
   * Marks the view as saving, writes through the workspace document adapter,
   * and only clears the dirty flag when no newer edits landed mid-flight.
   *
   * The write carries the text the tab was last level with on disk, so a file
   * something else has rewritten refuses this save instead of losing it. That
   * covers the case the conflict banner cannot: the banner only appears if the
   * watcher saw the change and the tab was already dirty, whereas the
   * precondition is checked on every save whatever the tab knew.
   *
   * @returns `true` when the write succeeded.
   */
  const saveDocument = useCallback(async (tab: DesktopTab): Promise<boolean> => {
    const document = documentsRef.current[tab.id];
    const rootPath = tab.resource?.rootPath;
    const relativePath = tab.resource?.relativePath;
    if (!document || !rootPath || !relativePath) return false;
    const expected = saveablePrecondition(document);
    if (expected === null) return false;

    setDocuments((current) => ({
      ...current,
      [tab.id]: { ...document, phase: "saving", error: null }
    }));
    const result = await saveWorkspaceDocument(workspaceDocumentApi, {
      rootPath,
      relativePath,
      contents: document.contents,
      expected
    });
    if (!result.ok) {
      // A refusal is not a failure to report. The tab keeps the user's text and
      // its dirty flag, and the banner puts the choice to them instead.
      if (result.code === NOTE_CONFLICT_ERROR_CODE) {
        setDocuments((current) => applyRefusedSave(current, tab.id));
        setConflicts((current) => markConflict(current, tab.id));
        return false;
      }
      setDocuments((current) => ({
        ...current,
        [tab.id]: { ...(current[tab.id] ?? document), phase: "error", error: result.message }
      }));
      return false;
    }

    const hasNewerEdits = documentsRef.current[tab.id]?.contents !== document.contents;
    setDocuments((current) => applySavedDocument(current, tab.id, document.contents));
    if (!hasNewerEdits) dispatchTabs({ type: "setDirty", tabId: tab.id, isDirty: false });
    // Saving settles any conflict this tab was holding: the user answered it by
    // writing their version, and the file is now theirs.
    setConflicts((current) => clearConflict(current, tab.id));
    return true;
  }, []);

  /**
   * Keeps the tab's unsaved edits and stops asking about the change on disk.
   *
   * Dismissing the banner is only half of it. The tab still computes its saves
   * from the version the user just declined, so without re-reading the file the
   * next save would be refused and this same notice would come back — with no
   * way through it. Re-anchoring is not the same as forcing the write: a
   * further change landing after this point is still caught.
   *
   * A failed read leaves the tab anchored where it was, so the save that
   * follows is refused rather than blind. Being asked twice is the safe way to
   * be wrong here.
   */
  const keepMyVersion = useCallback((tab: DesktopTab) => {
    setConflicts((current) => clearConflict(current, tab.id));
    const rootPath = tab.resource?.rootPath;
    const relativePath = tab.resource?.relativePath;
    if (!rootPath || !relativePath) return;
    void loadWorkspaceDocument(workspaceDocumentApi, { rootPath, relativePath }).then((result) => {
      if (!result.ok) return;
      setDocuments((current) => anchorDiskContents(current, tab.id, result.document.contents));
    });
  }, []);

  /**
   * Throws away the tab's unsaved edits and shows what is on disk.
   *
   * Uses the ordinary load rather than the in-place re-read: this is a
   * deliberate discard, so the brief loading state is honest, and the in-place
   * path would refuse anyway — its whole job is to not overwrite edits.
   */
  const loadDiskVersion = useCallback((tab: DesktopTab) => {
    const rootPath = tab.resource?.rootPath;
    const relativePath = tab.resource?.relativePath;
    if (!rootPath || !relativePath) return;
    setConflicts((current) => clearConflict(current, tab.id));
    dispatchTabs({ type: "setDirty", tabId: tab.id, isDirty: false });
    loadDocumentIntoView(tab.id, rootPath, relativePath);
  }, [loadDocumentIntoView]);

  const activeTab = tabState.tabs.find((tab) => tab.id === tabState.activeTabId) ?? null;
  const activeDocument = activeTab ? documents[activeTab.id] : undefined;

  // Global shortcuts: command palette (Ctrl/Cmd+P), explorer (Ctrl/Cmd+B),
  // bottom dock (Ctrl/Cmd+J), and Escape to dismiss the palette.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "p") {
        event.preventDefault();
        if (paletteOpen) closePalette();
        else openPalette();
      }
      if (modifier && event.key.toLowerCase() === "b") {
        event.preventDefault();
        selectLeftPanel("explorer");
      }
      if (modifier && event.key.toLowerCase() === "j") {
        event.preventDefault();
        toggleBottomPanel();
      }
      if (event.key === "Escape") {
        if (!event.defaultPrevented && paletteOpen) closePalette();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closePalette, openPalette, paletteOpen, selectLeftPanel, toggleBottomPanel]);

  // Dock widths are published as CSS custom properties so the popouts can size
  // themselves from tokens instead of inline styles. The left dock publishes 0
  // when collapsed so the title bar releases the reserved space.
  useEffect(() => {
    leftWidthRef.current = leftWidth;
    rightWidthRef.current = rightWidth;
    rootRef.current?.style.setProperty("--tn-shell-left-width", leftPanel ? `${leftWidth}px` : "0px");
    rootRef.current?.style.setProperty("--tn-shell-right-width", `${rightWidth}px`);
  }, [leftWidth, leftPanel, rightWidth]);

  /**
   * Starts a pointer-driven dock resize.
   *
   * Captures the pointer on the handle and tracks horizontal movement until the
   * pointer is released or cancelled. Right-side drags are inverted so dragging
   * inward always shrinks the dock.
   */
  const beginResize = useCallback(
    (side: PanelSide) => (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      resizeCleanupRef.current?.();

      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);
      const start = event.clientX;
      const original = side === "left" ? leftWidthRef.current : rightWidthRef.current;
      const previousUserSelect = document.body.style.userSelect;
      document.body.style.userSelect = "none";
      const move = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientX - start;
        const next = clampPanelWidth(original + (side === "left" ? delta : -delta));
        updatePanelWidth(side, next);
      };
      const finish = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
        document.body.style.userSelect = previousUserSelect;
        if (resizeCleanupRef.current === finish) resizeCleanupRef.current = null;
      };
      resizeCleanupRef.current = finish;
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
    },
    [updatePanelWidth],
  );

  /**
   * Keyboard alternative to dragging a resize handle.
   *
   * Left/Right arrows nudge the dock by 8px, or 24px while Shift is held.
   */
  const resizeWithKeyboard = useCallback(
    (side: PanelSide) => (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const amount = event.shiftKey ? 24 : 8;
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const applyDelta = side === "left" ? direction * amount : -direction * amount;
      const currentWidth = side === "left" ? leftWidthRef.current : rightWidthRef.current;
      updatePanelWidth(side, currentWidth + applyDelta);
    },
    [updatePanelWidth],
  );

  return (
    <main
      className="grid grid-rows-[2.25rem_minmax(0,1fr)_1.5rem] h-full min-w-184 max-[760px]:min-w-0 overflow-hidden bg-background text-foreground"
      ref={rootRef}
      aria-label="ThinkBrain desktop workspace"
    >
      <TitleBar
        tabs={tabState.tabs}
        activeTabId={tabState.activeTabId}
        rightPanel={rightPanel}
        onSelectTab={(tabId) => dispatchTabs({ type: "activate", tabId })}
        onRequestCloseTab={(tabId) => dispatchTabs({ type: "requestClose", tabId })}
        onToggleRightPanel={(panel) => setRightPanel((current) => current === panel ? null : panel)}
        onOpenCommandPalette={openPalette}
      />

      <div className="flex min-h-0 max-[760px]:relative">
        <ActivityBar
          leftPanel={leftPanel}
          onSelectLeftPanel={selectLeftPanel}
          onOpenSettings={openSettingsTab}
        />

        {leftPanel && (
          <>
            <LeftPopout
              panel={leftPanel}
              rootPath={restoredWorkspacePath}
              explorerProps={{
                initialWorkspacePath: stateRestored ? restoredWorkspacePath : null,
                onWorkspaceOpened: handleWorkspaceOpened,
                onWorkspaceUnavailable: handleWorkspaceUnavailable,
                onMarkdownFileSelected: openMarkdownDocument,
                onMarkdownFileCreated: handleMarkdownFileCreated,
                onNewNoteFocusHandled: acknowledgeNewNoteFocus,
                newNoteFocusRequest,
                recentWorkspacePaths,
                onWorkspaceLaunched: handleWorkspaceLaunched
              }}
              onOpenSearchResult={(relativePath) => {
                if (restoredWorkspacePath) openMarkdownDocument(restoredWorkspacePath, relativePath);
              }}
            />
            <ResizeHandle
              label="Resize left panel"
              onPointerDown={beginResize("left")}
              onPointerCancel={() => resizeCleanupRef.current?.()}
              onDoubleClick={() => resetPanelWidth("left")}
              onKeyDown={resizeWithKeyboard("left")}
            />
          </>
        )}

        <section className="flex flex-col flex-auto min-w-60" aria-label="Note workspace">
          <article className="flex flex-1 flex-col min-h-0 overflow-auto bg-editor">
            <div className="flex-[0_0_2rem] border-b border-border text-muted-foreground text-[0.72rem] py-[0.55rem] px-[0.9rem]">
              {workspaceName ?? "Workspace"}{" "}
              {activeTab && (
                <>
                  <span className="px-[0.28rem]">›</span> {activeTab.title}
                </>
              )}
            </div>
            {activeTab && conflicts.has(activeTab.id) && (
              <StaleDocumentBanner
                fileName={activeTab.title}
                onKeepMine={() => keepMyVersion(activeTab)}
                onLoadFromDisk={() => loadDiskVersion(activeTab)}
              />
            )}
            <TabContent tab={activeTab} document={activeDocument} onChange={updateDocument} onSave={saveDocument} noteIndex={noteIndex} onOpenNote={onOpenNote} />
          </article>
          {bottomPanel && (
            <BottomPanelContent
              active={bottomPanel}
              onChange={updateBottomPanel}
              onClose={() => updateBottomPanel(null)}
            />
          )}
        </section>

        {rightPanel && (
          <>
            <ResizeHandle
              label="Resize right panel"
              onPointerDown={beginResize("right")}
              onPointerCancel={() => resizeCleanupRef.current?.()}
              onDoubleClick={() => resetPanelWidth("right")}
              onKeyDown={resizeWithKeyboard("right")}
            />
            <RightPopout
              panel={rightPanel}
              rootPath={restoredWorkspacePath}
              documentContents={activeDocument?.phase === "ready"
                ? activeDocument.contents
                : null}
            />
          </>
        )}
      </div>

      <StatusBar workspaceName={workspaceName} />

      {paletteOpen && (
        <CommandPalette
          commands={paletteCommands}
          files={workspaceFiles
            .map((file): WorkspaceFileResult => ({ rootPath: restoredWorkspacePath ?? "", relativePath: file.relative_path }))
            .filter((file) => Boolean(file.rootPath))}
          onClose={closePalette}
          onCommand={handlePaletteCommand}
          onOpenFile={(file) => openMarkdownDocument(file.rootPath, file.relativePath)}
        />
      )}
      {tabState.closeRequest && (
        <DirtyCloseDialog
          tab={tabState.tabs.find((tab) => tab.id === tabState.closeRequest?.tabId) ?? null}
          onCancel={() => dispatchTabs({ type: "cancelClose", tabId: tabState.closeRequest!.tabId })}
          onDiscard={() => {
            const tab = tabState.tabs.find((candidate) => candidate.id === tabState.closeRequest?.tabId);
            // For settings tabs, clear staged changes so the store doesn't stay
            // dirty after discarding. Editor tabs have no staged settings state.
            if (tab?.kind === "settings") {
              useSettingsStore.getState().resetStaged();
            }
            dispatchTabs({ type: "discardClose", tabId: tabState.closeRequest!.tabId });
          }}
          onSave={async () => {
            const tab = tabState.tabs.find((candidate) => candidate.id === tabState.closeRequest?.tabId);
            if (!tab) return;
            // Settings tabs save through the settings store, not saveDocument.
            if (tab.kind === "settings") {
              const result = await useSettingsStore.getState().saveSettings();
              // On success, close the tab. On validation failure, leave the
              // dialog open so the user sees inline errors in the settings tab.
              if (result.success) {
                dispatchTabs({ type: "completeSaveAndClose", tabId: tab.id });
              }
              return;
            }
            // Editor tabs save through the document persistence layer.
            if (await saveDocument(tab)) {
              dispatchTabs({ type: "completeSaveAndClose", tabId: tab.id });
            }
          }}
        />
      )}
    </main>
  );
}

/** Converts a runtime tab to the serializable shape persisted in desktop state. */
function tabToPersisted(tab: DesktopTab): PersistedTab {
  return {
    id: tab.id,
    title: tab.title,
    kind: tab.kind,
    ...(tab.resource?.rootPath ? { rootPath: tab.resource.rootPath } : {}),
    ...(tab.resource?.relativePath ? { relativePath: tab.resource.relativePath } : {})
  };
}

/**
 * Reconstructs a runtime tab from persisted metadata.
 *
 * Editor tabs whose resource paths are missing are skipped: a tab with no file
 * to open would just show a blank editor. Static tabs (settings, calendar, etc.)
 * are restored by kind alone.
 */
function restoreTab(persisted: PersistedTab, fallbackRootPath: string | null): DesktopTab | null {
  if (persisted.kind === "editor") {
    const rootPath = persisted.rootPath ?? fallbackRootPath;
    const relativePath = persisted.relativePath;
    if (!rootPath || !relativePath) return null;
    return createEditorTab({ rootPath, relativePath });
  }
  // Validate the persisted static kind against the tab registry before casting.
  // A stale or corrupted persisted state with an unknown kind is skipped rather
  // than silently producing a broken tab that renders an Unavailable placeholder.
  if (desktopTabRegistry.get(persisted.kind) === undefined) return null;
  return createStaticTab(
    persisted.kind as Exclude<import("@thinkbrain/core").TabKind, "editor">,
    persisted.title
  );
}
