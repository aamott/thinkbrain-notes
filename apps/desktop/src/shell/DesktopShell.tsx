import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { CommandPalette, type WorkspaceFileResult } from "../commands/CommandPalette";
import {
  useDesktopCommands,
  type DesktopCommand,
  type DesktopCommandContext
} from "../commands/commandRegistry";
import { BottomPanel as BottomPanelContent } from "../panels/BottomPanel";
import { LeftPopout } from "../panels/LeftPopout";
import { useSyncSurfaces } from "../sync/useSyncSurfaces";
import { usePanelResize } from "./usePanelResize";
import { useDocumentViews } from "./useDocumentViews";
import { useExternalDocumentSync } from "./useExternalDocumentSync";
import { RightPopout } from "../panels/RightPopout";
import { useTheme } from "../settings/theme-context";
import { useSettingsStore } from "../settings/settingsStore";
import { useWikiLinkIndexStore } from "../wikiLinks/wikiLinkIndexStore";
import {
  createConflictTab,
  createStaticTab,
  desktopTabReducer,
  editorTabId,
  initialDesktopTabState,
} from "../tabs/tabModel";
import { ActivityBar } from "./ActivityBar";
import { DirtyCloseDialog } from "./DirtyCloseDialog";
import { ResizeHandle } from "./ResizeHandle";
import { StaleDocumentBanner } from "./StaleDocumentBanner";
import { UpdateBanner } from "./UpdateBanner";
import { useAppUpdate } from "./useAppUpdate";
import { checkForUpdate, relaunchApp } from "./appUpdater";
import { isBuiltInLeftPanel } from "../panels/panelRegistryModel";
import { isSelectableRightPanel, type RightPanel } from "./shellTypes";
import { StatusBar } from "./StatusBar";
import { TabContent } from "./TabContent";
import { TitleBar } from "./TitleBar";
import { useWorkspaceLifecycle } from "./useWorkspaceLifecycle";

export function DesktopShell() {
  const paletteCommands = useDesktopCommands();
  const rootRef = useRef<HTMLElement>(null);
  const [tabState, dispatchTabs] = useReducer(desktopTabReducer, initialDesktopTabState);
  // Read by the outside-change subscription, which outlives any one set of
  // tabs and must not be rebuilt every time one opens or closes.
  const tabStateRef = useRef(tabState);
  const paletteRestoreFocusRef = useRef<HTMLElement | null>(null);
  const [rightPanel, setRightPanel] = useState<RightPanel | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { theme, setTheme } = useTheme();

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
    tabStateRef.current = tabState;
  }, [tabState]);

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

  const {
    documents,
    conflicts,
    loadDocumentIntoView,
    openMarkdownDocument,
    reloadDocumentInPlace,
    updateDocument,
    saveDocument,
    keepMyVersion,
    loadDiskVersion,
    moveDocument,
    markDocumentConflict
  } = useDocumentViews({ tabState, dispatchTabs });

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

  // Cancel deferred writes if the shell unmounts. An in-flight drag is the
  // resize hook's own to clean up.
  useEffect(() => () => cancelDeferredPersistence(), [cancelDeferredPersistence]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setLeftPanel is a stable useState setter
  }, [closePalette, openSettingsTab, persistDesktopState, requestNewNoteFocus, selectLeftPanel, setTheme, showExplorer, theme, toggleBottomPanel, toggleLivePreview, updateBottomPanel]);

  const activeTab = tabState.tabs.find((tab) => tab.id === tabState.activeTabId) ?? null;

  // Which note the history panel is about. Set by "Previous versions…" in the
  // file tree and cleared by the panel itself, so opening History from the
  // footer is always the whole workspace rather than whatever was last asked.
  const [versionsOf, setVersionsOf] = useState<string | null>(null);
  const showVersionsOf = useCallback(
    (_rootPath: string, relativePath: string) => {
      setVersionsOf(relativePath);
      selectLeftPanel("history");
    },
    [selectLeftPanel]
  );
  const openSyncPanel = useCallback(
    (panel: "conflicts" | "history") => {
      if (panel === "history") setVersionsOf(null);
      selectLeftPanel(panel);
    },
    [selectLeftPanel]
  );

  useExternalDocumentSync({
    workspacePath: restoredWorkspacePath,
    tabStateRef,
    dispatchTabs,
    moveDocument,
    markDocumentConflict,
    reloadDocumentInPlace
  });

  const { beginResize, resizeWithKeyboard, cancelResize } = usePanelResize({
    leftWidthRef,
    rightWidthRef,
    updatePanelWidth
  });

  const { syncStatus, conflictBadges } = useSyncSurfaces({
    rootPath: restoredWorkspacePath ?? null,
    onReview: openSyncPanel
  });

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- leftWidthRef/rightWidthRef are stable refs
  }, [leftWidth, leftPanel, rightWidth]);

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
                onWorkspaceLaunched: handleWorkspaceLaunched,
                onShowVersions: showVersionsOf
              }}
              onReviewConflict={reviewConflict}
              versionsOf={versionsOf}
              onShowEverything={() => setVersionsOf(null)}
              onOpenSearchResult={(relativePath) => {
                if (restoredWorkspacePath) openMarkdownDocument(restoredWorkspacePath, relativePath);
              }}
            />
            <ResizeHandle
              label="Resize left panel"
              onPointerDown={beginResize("left")}
              onPointerCancel={cancelResize}
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
              onPointerCancel={cancelResize}
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

      <StatusBar
        workspaceName={workspaceName}
        syncStatus={syncStatus}
        onOpenSyncPanel={openSyncPanel}
        onOpenSettings={openSettingsTab}
      />

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
