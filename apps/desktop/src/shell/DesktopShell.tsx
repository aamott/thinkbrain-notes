import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useReducer, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
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
import { useSettingsStore } from "../settings/settingsStore";
import {
  createEditorTab,
  createStaticTab,
  desktopTabReducer,
  initialDesktopTabState,
  type DesktopTab
} from "../tabs/tabModel";
import { workspaceDocumentApi } from "../workspace/workspaceDocumentAdapter";
import { workspaceDesktopApi } from "../workspace/workspaceAdapter";
import { loadWorkspaceDocument, saveWorkspaceDocument } from "../workspace/workspaceDocumentModel";
import { ActivityBar } from "./ActivityBar";
import { DirtyCloseDialog } from "./DirtyCloseDialog";
import { ResizeHandle } from "./ResizeHandle";
import type { BottomPanel, DocumentViewState, LeftPanel, RightPanel } from "./shellTypes";
import { StatusBar } from "./StatusBar";
import { TabContent } from "./TabContent";
import { TitleBar } from "./TitleBar";

type PanelSide = "left" | "right";

/**
 * Root desktop shell composition.
 *
 * Owns shell-wide state (tabs, open documents, dock visibility, theme, panel
 * widths, workspace metadata) and composes the extracted chrome components:
 * {@link TitleBar}, {@link ActivityBar}, {@link LeftPopout}, {@link TabContent},
 * {@link BottomPanelContent}, {@link RightPopout}, and {@link StatusBar}.
 *
 * Presentation lives entirely in those components; this module is limited to
 * state, effects, and callbacks so the layout stays easy to reason about.
 */
export function DesktopShell() {
  const paletteCommands = useDesktopCommands();
  const rootRef = useRef<HTMLElement>(null);
  const [tabState, dispatchTabs] = useReducer(desktopTabReducer, initialDesktopTabState);
  const [documents, setDocuments] = useState<Record<string, DocumentViewState>>({});
  const documentsRef = useRef(documents);
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
  const panelWidthSaveTimersRef = useRef<Record<PanelSide, ReturnType<typeof setTimeout> | null>>({
    left: null,
    right: null
  });
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

  useEffect(() => {
    documentsRef.current = documents;
  }, [documents]);

  // Mirror the settings store's dirty flag into the tab system so the settings
  // tab shows the dirty dot and triggers DirtyCloseDialog on close. Only
  // dispatches when a settings tab is actually open to avoid spurious actions.
  useEffect(() => {
    if (!tabState.tabs.some((t) => t.id === "settings")) return;
    dispatchTabs({ type: "setDirty", tabId: "settings", isDirty: settingsIsDirty });
  }, [settingsIsDirty, tabState.tabs]);

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
        [tabId]: { phase: "loading", contents: "", error: null }
      }));
      void loadWorkspaceDocument(workspaceDocumentApi, { rootPath, relativePath }).then(
        (result) => {
          setDocuments((current) => ({
            ...current,
            [tabId]: result.ok
              ? { phase: "ready", contents: result.document.contents, error: null }
              : { phase: "error", contents: "", error: result.message }
          }));
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
  }, []);

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
  const tabSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!stateRestored || !isTauri()) return;
    if (tabSaveTimerRef.current !== null) clearTimeout(tabSaveTimerRef.current);
    tabSaveTimerRef.current = setTimeout(() => {
      tabSaveTimerRef.current = null;
      persistDesktopState({
        openTabs: tabState.tabs.map(tabToPersisted),
        activeTabId: tabState.activeTabId
      });
    }, 400);
  }, [tabState, stateRestored, persistDesktopState]);

  /**
   * Coalesces rapid resize updates so a drag writes its final width once rather
   * than rewriting the app-settings file for every pointer movement.
   */
  const schedulePanelWidthPersistence = useCallback((side: PanelSide, width: number) => {
    const pendingTimer = panelWidthSaveTimersRef.current[side];
    if (pendingTimer !== null) clearTimeout(pendingTimer);

    panelWidthSaveTimersRef.current[side] = setTimeout(() => {
      panelWidthSaveTimersRef.current[side] = null;
      persistDesktopState(side === "left" ? { leftPanelWidth: width } : { rightPanelWidth: width });
    }, 300);
  }, [persistDesktopState]);

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
    for (const side of ["left", "right"] as const) {
      const pendingTimer = panelWidthSaveTimersRef.current[side];
      if (pendingTimer !== null) clearTimeout(pendingTimer);
    }
    if (tabSaveTimerRef.current !== null) clearTimeout(tabSaveTimerRef.current);
    resizeCleanupRef.current?.();
  }, []);

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
    persistDesktopState({ lastWorkspacePath: rootPath, recentWorkspacePaths: recentPaths });
  }, [persistDesktopState, updateRecentWorkspacePaths]);

  const handleWorkspaceUnavailable = useCallback(() => {
    setRestoredWorkspacePath(null);
    setWorkspaceName(null);
    setWorkspaceFiles([]);
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

  const handleMarkdownFileCreated = useCallback((rootPath: string, relativePath: string) => {
    if (rootPath !== restoredWorkspacePath) return;
    setWorkspaceFiles((files) => files.some((file) => file.relative_path === relativePath)
      ? files
      : [...files, {
        relative_path: relativePath,
        file_name: relativePath.split("/").at(-1) ?? relativePath,
        parent_path: relativePath.split("/").slice(0, -1).join("/"),
        byte_size: 0,
        updated_at: null
      }]);
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
      revealPanel: (panelId: string) => setRightPanel(panelId),
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
   * @returns `true` when the write succeeded.
   */
  const saveDocument = useCallback(async (tab: DesktopTab): Promise<boolean> => {
    const document = documentsRef.current[tab.id];
    const rootPath = tab.resource?.rootPath;
    const relativePath = tab.resource?.relativePath;
    if (!document || !rootPath || !relativePath || document.phase === "loading") return false;

    setDocuments((current) => ({
      ...current,
      [tab.id]: { ...document, phase: "saving", error: null }
    }));
    const result = await saveWorkspaceDocument(workspaceDocumentApi, {
      rootPath,
      relativePath,
      contents: document.contents
    });
    if (!result.ok) {
      setDocuments((current) => ({
        ...current,
        [tab.id]: { ...(current[tab.id] ?? document), phase: "error", error: result.message }
      }));
      return false;
    }

    const hasNewerEdits = documentsRef.current[tab.id]?.contents !== document.contents;
    setDocuments((current) => ({
      ...current,
      [tab.id]: {
        phase: "ready",
        contents: current[tab.id]?.contents ?? result.document.contents,
        error: null
      }
    }));
    if (!hasNewerEdits) dispatchTabs({ type: "setDirty", tabId: tab.id, isDirty: false });
    return true;
  }, []);

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
      className="grid grid-rows-[2.25rem_minmax(0,1fr)_1.5rem] h-full min-w-[46rem] max-[760px]:min-w-0 overflow-hidden bg-background text-foreground"
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

        <section className="flex flex-col flex-auto min-w-[15rem]" aria-label="Note workspace">
          <article className="flex flex-1 flex-col min-h-0 overflow-auto bg-editor">
            <div className="flex-[0_0_2rem] border-b border-border text-muted-foreground text-[0.72rem] py-[0.55rem] px-[0.9rem]">
              {workspaceName ?? "Workspace"}{" "}
              {activeTab && (
                <>
                  <span className="px-[0.28rem]">›</span> {activeTab.title}
                </>
              )}
            </div>
            <TabContent tab={activeTab} document={activeDocument} onChange={updateDocument} onSave={saveDocument} />
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
  return createStaticTab(persisted.kind as Exclude<import("@thinkbrain/core").TabKind, "editor">, persisted.title);
}
