import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { CommandPalette, type WorkspaceFileResult } from "../commands/CommandPalette";
import {
  useDesktopCommands,
  type DesktopCommand,
  type DesktopCommandContext
} from "../commands/commandRegistry";
import { appEvents } from "../events/appEvents";
import { BottomPanel as BottomPanelContent } from "../panels/BottomPanel";
import { LeftPopout } from "../panels/LeftPopout";
import { useConflictCount } from "../sync/useConflictCount";
import { RightPopout } from "../panels/RightPopout";
import { useTheme } from "../settings/theme-context";
import { useSettingsStore } from "../settings/settingsStore";
import { useWikiLinkIndexStore } from "../wikiLinks/wikiLinkIndexStore";
import { releaseEditorStatesExcept } from "../tabs/editorStateCache";
import {
  createEditorTab,
  createConflictTab,
  createStaticTab,
  desktopTabReducer,
  editorTabId,
  initialDesktopTabState,
  type DesktopTab,
} from "../tabs/tabModel";
import { subscribeToNoteChanges } from "../events/noteChangeSubscription";
import { workspaceDocumentApi } from "../workspace/workspaceDocumentAdapter";
import { loadWorkspaceDocument, saveWorkspaceDocument } from "../workspace/workspaceDocumentModel";
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
import { UpdateBanner } from "./UpdateBanner";
import { useAppUpdate } from "./useAppUpdate";
import { checkForUpdate, relaunchApp } from "./appUpdater";
import { isBuiltInLeftPanel } from "../panels/panelRegistry";
import { isSelectableRightPanel, type DocumentViewState, type RightPanel } from "./shellTypes";
import { StatusBar } from "./StatusBar";
import { TabContent } from "./TabContent";
import { TitleBar } from "./TitleBar";
import { useWorkspaceLifecycle } from "./useWorkspaceLifecycle";

type PanelSide = "left" | "right";

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
  const [rightPanel, setRightPanel] = useState<RightPanel | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const resizeCleanupRef = useRef<(() => void) | null>(null);

  // Looks once per window for a newer version. Silent when there is none,
  // and silent about a check it could not make at all.
  const update = useAppUpdate(checkForUpdate, relaunchApp);

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

  const openMarkdownDocument = useCallback((rootPath: string, relativePath: string) => {
    const tab = createEditorTab({ rootPath, relativePath });
    dispatchTabs({ type: "open", tab });
    appEvents.emit("note.opened", { rootPath, relativePath });

    if (documentsRef.current[tab.id]) return;
    loadDocumentIntoView(tab.id, rootPath, relativePath);
  }, [loadDocumentIntoView]);

  const {
    acknowledgeNewNoteFocus,
    bottomPanel,
    cancelDeferredPersistence,
    handleMarkdownFileCreated,
    handleWorkspaceLaunched,
    handleWorkspaceOpened,
    handleWorkspaceUnavailable,
    leftPanel,
    leftWidth,
    leftWidthRef,
    newNoteFocusRequest,
    persistDesktopState,
    recentWorkspacePaths,
    resetPanelWidth,
    requestNewNoteFocus,
    restoredWorkspacePath,
    rightWidth,
    rightWidthRef,
    selectLeftPanel,
    setLeftPanel,
    showExplorer,
    stateRestored,
    toggleBottomPanel,
    updateBottomPanel,
    updatePanelWidth,
    workspaceFiles,
    workspaceName
  } = useWorkspaceLifecycle({ tabState, dispatchTabs, loadDocumentIntoView, openMarkdownDocument });

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

  // Cancel deferred writes and an active drag if the shell unmounts.
  useEffect(() => () => {
    cancelDeferredPersistence();
    resizeCleanupRef.current?.();
  }, [cancelDeferredPersistence]);

  const openPalette = useCallback(() => {
    paletteRestoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPaletteOpen(true);
  }, []);

  const closePalette = useCallback((restoreFocus = true) => {
    setPaletteOpen(false);
    if (restoreFocus) queueMicrotask(() => paletteRestoreFocusRef.current?.focus());
  }, []);

  const openSettingsTab = useCallback(() => {
    dispatchTabs({ type: "open", tab: createStaticTab("settings", "Settings") });
  }, []);

  // Opens a note by vault-relative path when a wiki link is clicked. Delegates
  // to `openMarkdownDocument` with the current workspace root.
  const onOpenNote = useCallback(
    (relativePath: string) => {
      if (!restoredWorkspacePath) return;
      openMarkdownDocument(restoredWorkspacePath, relativePath);
    },
    [restoredWorkspacePath, openMarkdownDocument]
  );

  // Opens the side-by-side comparison for a conflict. Named by the copy the
  // sync daemon left behind, which is what identifies a conflict everywhere
  // else; the note's own path rides along so the tab can be titled after it and
  // can find an editor open on it.
  const reviewConflict = useCallback(
    (copyPath: string, notePath: string) => {
      if (!restoredWorkspacePath) return;
      dispatchTabs({
        type: "open",
        tab: createConflictTab({ rootPath: restoredWorkspacePath, relativePath: copyPath }, notePath)
      });
    },
    [restoredWorkspacePath]
  );

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
      focusNewNote: requestNewNoteFocus,
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

  // Read here rather than inside the panel: the number has to be visible to
  // someone who has never opened it, which is exactly when the panel is not
  // mounted to count anything.
  const conflictCount = useConflictCount(restoredWorkspacePath ?? null);
  const conflictBadges = useMemo<Readonly<Record<string, number>>>(() => {
    const badges: Record<string, number> = {};
    if (conflictCount > 0) badges.conflicts = conflictCount;
    return badges;
  }, [conflictCount]);

  // The unsaved text of an editor open on the note a merge tab is comparing.
  // "This computer's version" has to be what the user is looking at; offering
  // them the last save would be offering a version they can see is out of date.
  const unsavedNoteContents = useMemo(() => {
    const notePath = activeTab?.kind === "merge" ? activeTab.comparedNotePath : undefined;
    if (!notePath || !restoredWorkspacePath) return null;
    const editorId = editorTabId({ rootPath: restoredWorkspacePath, relativePath: notePath });
    const editorTab = tabState.tabs.find((tab) => tab.id === editorId);
    return editorTab?.isDirty ? documents[editorId]?.contents ?? null : null;
  }, [activeTab, documents, restoredWorkspacePath, tabState.tabs]);

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
        const next = original + (side === "left" ? delta : -delta);
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
      className="grid grid-rows-[2.25rem_auto_minmax(0,1fr)_1.5rem] h-full min-w-184 max-[760px]:min-w-0 overflow-hidden bg-background text-foreground"
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

      {/* Its own grid row, which collapses to nothing while there is no update
          to offer. Above the workspace rather than inside a tab: this is about
          the app, not about the note anyone happens to be reading. */}
      <UpdateBanner state={update.state} onInstall={update.install} onDismiss={update.dismiss} />

      <div className="flex min-h-0 max-[760px]:relative">
        <ActivityBar
          leftPanel={leftPanel}
          onSelectLeftPanel={selectLeftPanel}
          onOpenSettings={openSettingsTab}
          badges={conflictBadges}
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
              onReviewConflict={reviewConflict}
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
            <TabContent tab={activeTab} document={activeDocument} onChange={updateDocument} onSave={saveDocument} noteIndex={noteIndex} onOpenNote={onOpenNote} unsavedNoteContents={unsavedNoteContents} />
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
