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
  useState
} from "react";

import { useSettingsQuarantineAdapter } from "../settings/settingsQuarantineAdapter";
import { selectIsDirty, useSettingsStore } from "../settings/settingsStore";
import { useTheme } from "../settings/ThemeProvider";
import { useSyncSurfaces } from "../sync/useSyncSurfaces";
import {
  desktopTabReducer,
  documentTabId,
  initialDesktopTabState
} from "../tabs/tabModel";
import { useWikiLinkIndexStore } from "../wikiLinks/wikiLinkIndexStore";
import type { WorkspaceExplorerProps } from "../workspace/WorkspaceExplorer";
import { checkForUpdate, relaunchApp } from "./appUpdater";
import type { ShellState } from "./shellStateTypes";
import type { RightPanel } from "./shellTypes";
import { useAppUpdate } from "./useAppUpdate";
import { useDocumentViews } from "./useDocumentViews";
import { useExternalDocumentSync } from "./useExternalDocumentSync";
import { usePanelResize } from "./usePanelResize";
import { useShellCommands } from "./useShellCommands";
import { useShellShortcuts } from "./useShellShortcuts";
import { useSyncActions } from "./useSyncActions";
import { useWorkspaceLifecycle } from "./useWorkspaceLifecycle";

export type { ShellState } from "./shellStateTypes";

export function useShellState(): ShellState {
  const [tabState, dispatchTabs] = useReducer(desktopTabReducer, initialDesktopTabState);
  // Read by the outside-change subscription, which outlives any one set of
  // tabs and must not be rebuilt every time one opens or closes.
  const tabStateRef = useRef(tabState);
  const [rightPanel, setRightPanel] = useState<RightPanel | null>(null);
  const { theme, setTheme } = useTheme();

  // Looks once per window for a newer version. Silent when there is none,
  // and silent about a check it could not make at all.
  const update = useAppUpdate(checkForUpdate, relaunchApp);

  // Subscribe to the settings store's dirty flag so the settings tab shows the
  // dirty dot when staged changes exist. This re-renders the shell when
  // isDirty changes, which is acceptable (infrequent, boolean toggle).
  const settingsIsDirty = useSettingsStore(selectIsDirty);

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
    dismissEmptied,
    renameDocument
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

  // Tab-activation history is per-workspace: a switch rebases it on the
  // active tab so Back can never walk into the previous vault's visits.
  // The reducer returns the state untouched while it is already reset, so
  // the mount-time fire on a still-empty history costs nothing.
  useEffect(() => {
    dispatchTabs({ type: "resetHistory" });
  }, [restoredWorkspacePath]);

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

  // The palette's open state, focus restore and command dispatch.
  const {
    closePalette,
    openPalette,
    openSettingsTab,
    paletteCommands,
    paletteOpen,
    runCommand
  } = useShellCommands({
    dispatchTabs,
    theme,
    setTheme,
    showExplorer,
    requestNewNoteFocus,
    selectLeftPanel,
    setLeftPanel,
    setRightPanel,
    toggleRightPanel,
    updateBottomPanel,
    toggleBottomPanel
  });

  // Opens a note by vault-relative path when a wiki link is clicked. Delegates
  // to `openMarkdownDocument` with the current workspace root.
  const onOpenNote = useCallback(
    (relativePath: string) => {
      if (!restoredWorkspacePath) return;
      openMarkdownDocument(restoredWorkspacePath, relativePath);
    },
    [restoredWorkspacePath, openMarkdownDocument]
  );

  // Conflict review and version-history actions for the sync surfaces.
  const {
    compareVersion,
    openSyncPanel,
    openSyncSettings,
    restoreVersionSafely,
    reviewConflict,
    showVersionsOf
  } = useSyncActions({
    restoredWorkspacePath,
    dispatchTabs,
    tabStateRef,
    setRightPanel,
    selectLeftPanel,
    openMarkdownDocument,
    openFileDocument,
    saveDocument,
    loadDocumentIntoView,
    openSettingsTab
  });

  const activeTab = tabState.tabs.find((tab) => tab.id === tabState.activeTabId) ?? null;

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

  // The unsaved text of a document open on the file a comparison tab is
  // about — a merge's "this computer's version", a version-diff's "current
  // version". It has to be what the user is looking at; offering them the
  // last save would be offering a version they can see is out of date.
  const unsavedNoteContents = useMemo(() => {
    const notePath =
      activeTab?.kind === "merge" || activeTab?.kind === "version-diff"
        ? activeTab.comparedNotePath
        : undefined;
    if (!notePath || !restoredWorkspacePath) return null;
    const sourceId = documentTabId({ rootPath: restoredWorkspacePath, relativePath: notePath });
    const sourceTab = tabState.tabs.find((tab) => tab.id === sourceId);
    return sourceTab?.isDirty ? documents[sourceId]?.contents ?? null : null;
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
    renameDocument,
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
    showVersionsOf,
    openSyncPanel,
    compareVersion,
    restoreVersionSafely,
    openSyncSettings,
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
