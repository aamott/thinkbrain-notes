/**
 * Everything the shell knows, with nothing it draws.
 *
 * `DesktopShell` used to be state and chrome in one file, which made a second
 * chrome impossible: a phone presentation would either duplicate the tab
 * reducer, the document views and the command context, or reach inside a
 * component to borrow them. Neither is a thing to maintain.
 *
 * So the state lives here and the chromes are consumers. `DesktopShell` renders
 * the rail and the docks from this; `PhoneShell` renders a header, a drawer and
 * a hub from the same object. Anything that is a decision — which panel is
 * open, which tab is active, what a command does — belongs in this hook.
 * Anything that is a measurement of a rendered box belongs in the chrome.
 *
 * The one deliberate exception is the dock-width CSS custom properties: they
 * are written onto the desktop chrome's own root element, so that effect stays
 * in `DesktopShell`. The widths themselves are state and are published here.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction
} from "react";

import {
  useDesktopCommands,
  type DesktopCommand,
  type DesktopCommandContext
} from "../commands/commandRegistry";
import type { NativeMarkdownFileEntry } from "../native/commands";
import { isBuiltInLeftPanel } from "../panels/panelRegistryModel";
import { useSettingsQuarantineAdapter } from "../settings/settingsQuarantineAdapter";
import { useSettingsStore } from "../settings/settingsStore";
import { useTheme } from "../settings/ThemeProvider";
import type { SyncStatus } from "../sync/historyTypes";
import { useSyncSurfaces } from "../sync/useSyncSurfaces";
import {
  createConflictTab,
  createStaticTab,
  desktopTabReducer,
  editorTabId,
  initialDesktopTabState,
  type DesktopTab,
  type DesktopTabAction,
  type DesktopTabState
} from "../tabs/tabModel";
import { useWikiLinkIndexStore } from "../wikiLinks/wikiLinkIndexStore";
import type { NoteIndexEntry } from "@thinkbrain/core";
import type { WorkspaceExplorerProps } from "../workspace/WorkspaceExplorer";
import { checkForUpdate, relaunchApp } from "./appUpdater";
import { useAppUpdate, type AppUpdate } from "./useAppUpdate";
import { useDocumentViews } from "./useDocumentViews";
import { useExternalDocumentSync } from "./useExternalDocumentSync";
import { usePanelResize, type PanelResize } from "./usePanelResize";
import { useShellShortcuts } from "./useShellShortcuts";
import { useWorkspaceLifecycle } from "./useWorkspaceLifecycle";
import {
  isSelectableRightPanel,
  type BottomPanel,
  type DocumentViewState,
  type LeftPanel,
  type PanelSide,
  type RightPanel
} from "./shellTypes";

/** The shell's whole state, as both chromes consume it. */
export interface ShellState {
  // tabs & documents
  readonly tabState: DesktopTabState;
  readonly dispatchTabs: Dispatch<DesktopTabAction>;
  readonly activeTab: DesktopTab | null;
  readonly activeDocument: DocumentViewState | undefined;
  readonly documents: Readonly<Record<string, DocumentViewState>>;
  readonly conflicts: ReadonlySet<string>;
  readonly unsavedNoteContents: string | null;
  readonly saveDocument: (tab: DesktopTab) => Promise<boolean>;
  readonly updateDocument: (tabId: string, contents: string) => void;
  readonly loadDocumentIntoView: (tabId: string, rootPath: string, relativePath: string) => void;
  readonly openMarkdownDocument: (rootPath: string, relativePath: string) => void;
  readonly openFileDocument: (rootPath: string, relativePath: string) => void;
  readonly keepMyVersion: (tab: DesktopTab) => void;
  readonly loadDiskVersion: (tab: DesktopTab) => void;
  readonly dismissEmptied: (tabId: string) => void;
  readonly onOpenNote: (relativePath: string) => void;

  // panels
  readonly leftPanel: LeftPanel | null;
  readonly rightPanel: RightPanel | null;
  readonly setRightPanel: Dispatch<SetStateAction<RightPanel | null>>;
  /** Sets the left panel without toggling. Prefer {@link selectLeftPanel} for user toggles. */
  readonly setLeftPanel: Dispatch<SetStateAction<LeftPanel | null>>;
  readonly selectLeftPanel: (panel: LeftPanel) => void;
  /** Reveals a right panel, or closes it when it is already the open one. */
  readonly toggleRightPanel: (panel: RightPanel) => void;
  readonly bottomPanel: BottomPanel | null;
  readonly updateBottomPanel: (panel: BottomPanel | null) => void;
  readonly toggleBottomPanel: () => void;

  // workspace
  readonly workspaceName: string | null;
  readonly restoredWorkspacePath: string | null;
  readonly workspaceFiles: readonly NativeMarkdownFileEntry[];
  readonly recentWorkspacePaths: readonly string[];
  readonly stateRestored: boolean;
  /** The explorer's whole prop bag, assembled once so both chromes agree. */
  readonly explorerProps: WorkspaceExplorerProps;
  readonly versionsOf: string | null;
  readonly showVersionsOf: (rootPath: string, relativePath: string) => void;
  /** Clears the history panel's note filter, so it shows the whole workspace. */
  readonly clearVersions: () => void;
  readonly openSyncPanel: (panel: "conflicts" | "history") => void;
  readonly reviewConflict: (copyPath: string, notePath: string) => void;

  // chrome-agnostic services
  readonly paletteOpen: boolean;
  readonly openPalette: () => void;
  readonly closePalette: (restoreFocus?: boolean) => void;
  readonly paletteCommands: readonly DesktopCommand[];
  readonly runCommand: (command: DesktopCommand) => void;
  readonly openSettingsTab: () => void;
  readonly syncStatus: SyncStatus;
  readonly conflictBadges: Readonly<Record<string, number>>;
  readonly noteIndex: readonly NoteIndexEntry[];
  readonly update: AppUpdate;

  // desktop-only, ignored by PhoneShell
  readonly leftWidth: number;
  readonly rightWidth: number;
  readonly resize: PanelResize;
  readonly resetPanelWidth: (side: PanelSide) => void;
}

export function useShellState(): ShellState {
  const paletteCommands = useDesktopCommands();
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
  // dirty dot when staged changes exist. This re-renders the shell when
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
    openFileDocument,
    reloadDocumentInPlace,
    updateDocument,
    saveDocument,
    keepMyVersion,
    loadDiskVersion,
    moveDocument,
    markDocumentConflict,
    dismissEmptied
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
  } = useWorkspaceLifecycle({ tabState, dispatchTabs, loadDocumentIntoView, openMarkdownDocument, openFileDocument });

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

  /**
   * Reveals a right panel, or closes it when it is already showing.
   *
   * Both chromes need this — the desktop title bar's inspector buttons and the
   * phone's hub shortcuts — so it lives here rather than as an inline setter
   * in one of them.
   */
  const toggleRightPanel = useCallback((panel: RightPanel) => {
    setRightPanel((current) => (current === panel ? null : panel));
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
  const runCommand = useCallback((command: DesktopCommand) => {
    const context: DesktopCommandContext = {
      showExplorer,
      focusNewNote: requestNewNoteFocus,
      openSearch: () => {
        setLeftPanel("search");
        persistDesktopState({ explorerOpen: false });
      },
      toggleTheme: () => setTheme(theme === "dark" ? "light" : "dark"),
      toggleExplorer: () => selectLeftPanel("explorer"),
      toggleOutline: () => toggleRightPanel("outline"),
      toggleAssistant: () => toggleRightPanel("assistant"),
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
  }, [closePalette, openSettingsTab, persistDesktopState, requestNewNoteFocus, selectLeftPanel, setLeftPanel, setTheme, showExplorer, theme, toggleBottomPanel, toggleLivePreview, toggleRightPanel, updateBottomPanel]);

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
  const clearVersions = useCallback(() => setVersionsOf(null), []);
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

  // Says so if a settings document had to be set aside at startup. Silent on
  // every ordinary launch.
  useSettingsQuarantineAdapter();

  const resize = usePanelResize({ leftWidthRef, rightWidthRef, updatePanelWidth });

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

  /**
   * The explorer's props, assembled once.
   *
   * The desktop dock and the phone drawer render the same explorer, and the
   * bag is long enough that two hand-written copies would drift. Memoized
   * because `WorkspaceExplorer` is `memo`-wrapped — a fresh object every
   * render would defeat that.
   */
  const explorerProps = useMemo<WorkspaceExplorerProps>(
    () => ({
      initialWorkspacePath: stateRestored ? restoredWorkspacePath : null,
      onWorkspaceOpened: handleWorkspaceOpened,
      onWorkspaceUnavailable: handleWorkspaceUnavailable,
      onMarkdownFileSelected: openMarkdownDocument,
      onFileSelected: openFileDocument,
      onMarkdownFileCreated: handleMarkdownFileCreated,
      onNewNoteFocusHandled: acknowledgeNewNoteFocus,
      newNoteFocusRequest,
      recentWorkspacePaths,
      onWorkspaceLaunched: handleWorkspaceLaunched,
      onShowVersions: showVersionsOf
    }),
    [
      stateRestored,
      restoredWorkspacePath,
      handleWorkspaceOpened,
      handleWorkspaceUnavailable,
      openMarkdownDocument,
      openFileDocument,
      handleMarkdownFileCreated,
      acknowledgeNewNoteFocus,
      newNoteFocusRequest,
      recentWorkspacePaths,
      handleWorkspaceLaunched,
      showVersionsOf
    ]
  );

  useShellShortcuts({
    tabState,
    dispatchTabs,
    activeTab,
    paletteOpen,
    openPalette,
    closePalette,
    selectLeftPanel,
    toggleBottomPanel,
    saveDocument
  });

  // Keep the width refs level with the width state. The refs are what a drag
  // reads at pointer-down; the state is what a chrome renders from. This is
  // bookkeeping, not layout, so it stays out of the chrome — only the CSS
  // custom properties, which are written onto a chrome's own root element,
  // remain there.
  useEffect(() => {
    leftWidthRef.current = leftWidth;
    rightWidthRef.current = rightWidth;
  }, [leftWidthRef, leftWidth, rightWidthRef, rightWidth]);

  return {
    tabState,
    dispatchTabs,
    activeTab,
    activeDocument,
    documents,
    conflicts,
    unsavedNoteContents,
    saveDocument,
    updateDocument,
    loadDocumentIntoView,
    openMarkdownDocument,
    openFileDocument,
    keepMyVersion,
    loadDiskVersion,
    dismissEmptied,
    onOpenNote,

    leftPanel,
    rightPanel,
    setRightPanel,
    setLeftPanel,
    selectLeftPanel,
    toggleRightPanel,
    bottomPanel,
    updateBottomPanel,
    toggleBottomPanel,

    workspaceName,
    restoredWorkspacePath,
    workspaceFiles,
    recentWorkspacePaths,
    stateRestored,
    explorerProps,
    versionsOf,
    showVersionsOf,
    clearVersions,
    openSyncPanel,
    reviewConflict,

    paletteOpen,
    openPalette,
    closePalette,
    paletteCommands,
    runCommand,
    openSettingsTab,
    syncStatus,
    conflictBadges,
    noteIndex,
    update,

    leftWidth,
    rightWidth,
    resize,
    resetPanelWidth
  };
}
