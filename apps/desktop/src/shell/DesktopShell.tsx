import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useReducer, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { CommandPalette, type WorkspaceFileResult } from "../commands/CommandPalette";
import { createDesktopCommandRegistry, type DesktopCommand } from "../commands/commandRegistry";
import { gitService } from "../git/gitService";
import { BottomPanel as BottomPanelContent } from "../panels/BottomPanel";
import { LeftPopout } from "../panels/LeftPopout";
import { RightPopout } from "../panels/RightPopout";
import type { NativeMarkdownFileEntry, NativeWorkspaceSnapshot } from "../native/commands";
import { DEFAULT_DESKTOP_STATE, loadDesktopState, promoteRecentWorkspace, saveDesktopState, type DesktopStateUpdate } from "../settings/desktopState";
import { useTheme } from "../settings/theme-context";
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

/** Command palette entries available across the desktop shell. */
const desktopCommandRegistry = createDesktopCommandRegistry();

/** Minimum and maximum widths (px) allowed for the left/right dock popouts. */
const MIN_PANEL_WIDTH = 224;
const MAX_PANEL_WIDTH = 480;

/** Clamps a requested dock width into the supported range. */
const clampPanelWidth = (width: number) => Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, width));

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
  const rootRef = useRef<HTMLElement>(null);
  const [tabState, dispatchTabs] = useReducer(desktopTabReducer, initialDesktopTabState);
  const [documents, setDocuments] = useState<Record<string, DocumentViewState>>({});
  const documentsRef = useRef(documents);
  const paletteRestoreFocusRef = useRef<HTMLElement | null>(null);
  const [leftPanel, setLeftPanel] = useState<LeftPanel | null>("explorer");
  const [rightPanel, setRightPanel] = useState<RightPanel | null>("outline");
  const [bottomPanel, setBottomPanel] = useState<BottomPanel | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const [leftWidth, setLeftWidth] = useState(288);
  const [rightWidth, setRightWidth] = useState(320);
  const [restoredWorkspacePath, setRestoredWorkspacePath] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [workspaceFiles, setWorkspaceFiles] = useState<readonly NativeMarkdownFileEntry[]>([]);
  const [recentWorkspacePaths, setRecentWorkspacePaths] = useState<readonly string[]>([]);
  const recentWorkspacePathsRef = useRef<readonly string[]>([]);
  const [newNoteFocusRequest, setNewNoteFocusRequest] = useState(0);
  const [stateRestored, setStateRestored] = useState(!isTauri());

  useEffect(() => {
    documentsRef.current = documents;
  }, [documents]);

  const updateRecentWorkspacePaths = useCallback((rootPath: string): readonly string[] => {
    const next = promoteRecentWorkspace(recentWorkspacePathsRef.current, rootPath);
    recentWorkspacePathsRef.current = next;
    setRecentWorkspacePaths(next);
    return next;
  }, []);

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
    persistDesktopState({ recentWorkspacePaths: recentPaths });
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

    if (documentsRef.current[tab.id]) return;
    setDocuments((current) => ({
      ...current,
      [tab.id]: { phase: "loading", contents: "", error: null }
    }));
    void loadWorkspaceDocument(workspaceDocumentApi, { rootPath, relativePath }).then((result) => {
      setDocuments((current) => ({
        ...current,
        [tab.id]: result.ok
          ? { phase: "ready", contents: result.document.contents, error: null }
          : { phase: "error", contents: "", error: result.message }
      }));
    });
  }, []);

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

  const handlePaletteCommand = useCallback((command: DesktopCommand) => {
    switch (command.intent.type) {
      case "open-file":
        return;
      case "new-note":
        showExplorer();
        setNewNoteFocusRequest((request) => request + 1);
        closePalette(false);
        return;
      case "search":
        setLeftPanel("search");
        persistDesktopState({ explorerOpen: false });
        closePalette();
        return;
      case "toggle-theme":
        setTheme(theme === "dark" ? "light" : "dark");
        closePalette();
        return;
      case "toggle-panel":
        if (!("panel" in command.intent)) return;
        if (command.intent.panel === "explorer") selectLeftPanel("explorer");
        if (command.intent.panel === "outline") setRightPanel((panel) => panel === "outline" ? null : "outline");
        if (command.intent.panel === "assistant") setRightPanel((panel) => panel === "assistant" ? null : "assistant");
        if (command.intent.panel === "bottom") setBottomPanel((panel) => panel ? null : "terminal");
        closePalette();
        return;
      case "open-settings":
        openSettingsTab();
        closePalette();
        return;
      case "rebuild-index":
        setBottomPanel("output");
        closePalette();
        return;
    }
  }, [closePalette, openSettingsTab, persistDesktopState, selectLeftPanel, setTheme, showExplorer, theme]);

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
        setBottomPanel((panel) => panel ? null : "terminal");
      }
      if (event.key === "Escape") {
        if (!event.defaultPrevented && paletteOpen) closePalette();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closePalette, openPalette, paletteOpen, selectLeftPanel]);

  // Dock widths are published as CSS custom properties so the popouts can size
  // themselves from tokens instead of inline styles.
  useEffect(() => {
    rootRef.current?.style.setProperty("--tn-shell-left-width", `${leftWidth}px`);
  }, [leftWidth]);

  useEffect(() => {
    rootRef.current?.style.setProperty("--tn-shell-right-width", `${rightWidth}px`);
  }, [rightWidth]);

  /**
   * Starts a pointer-driven dock resize.
   *
   * Captures the pointer on the handle and tracks horizontal movement until the
   * pointer is released or cancelled. Right-side drags are inverted so dragging
   * inward always shrinks the dock.
   */
  const beginResize = (side: "left" | "right") => (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const start = event.clientX;
    const original = side === "left" ? leftWidth : rightWidth;
    const move = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - start;
      const next = clampPanelWidth(original + (side === "left" ? delta : -delta));
      if (side === "left") setLeftWidth(next);
      else setRightWidth(next);
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  };

  /**
   * Keyboard alternative to dragging a resize handle.
   *
   * Left/Right arrows nudge the dock by 8px, or 24px while Shift is held.
   */
  const resizeWithKeyboard = (side: "left" | "right") => (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const amount = event.shiftKey ? 24 : 8;
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const applyDelta = side === "left" ? direction * amount : -direction * amount;
    if (side === "left") setLeftWidth((width) => clampPanelWidth(width + applyDelta));
    else setRightWidth((width) => clampPanelWidth(width + applyDelta));
  };

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
        theme={theme}
        onSelectTab={(tabId) => dispatchTabs({ type: "activate", tabId })}
        onRequestCloseTab={(tabId) => dispatchTabs({ type: "requestClose", tabId })}
        onToggleRightPanel={(panel) => setRightPanel((current) => current === panel ? null : panel)}
        onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
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
            <ResizeHandle label="Resize left panel" onPointerDown={beginResize("left")} onKeyDown={resizeWithKeyboard("left")} />
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
            <TabContent tab={activeTab} document={activeTab ? documents[activeTab.id] : undefined} onChange={updateDocument} onSave={saveDocument} />
          </article>
          {bottomPanel && <BottomPanelContent active={bottomPanel} onChange={setBottomPanel} onClose={() => setBottomPanel(null)} />}
        </section>

        {rightPanel && (
          <>
            <ResizeHandle label="Resize right panel" onPointerDown={beginResize("right")} onKeyDown={resizeWithKeyboard("right")} />
            <RightPopout panel={rightPanel} />
          </>
        )}
      </div>

      <StatusBar
        workspaceName={workspaceName}
        bottomPanel={bottomPanel}
        onToggleBottomPanel={() => setBottomPanel((panel) => panel ? null : "terminal")}
      />

      {paletteOpen && (
        <CommandPalette
          commands={desktopCommandRegistry.entries()}
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
          onDiscard={() => dispatchTabs({ type: "discardClose", tabId: tabState.closeRequest!.tabId })}
          onSave={async () => {
            const tab = tabState.tabs.find((candidate) => candidate.id === tabState.closeRequest?.tabId);
            if (tab && (await saveDocument(tab))) dispatchTabs({ type: "completeSaveAndClose", tabId: tab.id });
          }}
        />
      )}
    </main>
  );
}
