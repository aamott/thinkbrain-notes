import { isTauri } from "@tauri-apps/api/core";
import { lazy, Suspense, useCallback, useEffect, useReducer, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { CommandPalette, type WorkspaceFileResult } from "../commands/CommandPalette";
import { createDesktopCommandRegistry, type DesktopCommand } from "../commands/commandRegistry";
import { SourceControlPanel } from "../git/SourceControlPanel";
import { gitService } from "../git/gitService";
import { cn } from "../lib/utils";
import type { NativeMarkdownFileEntry, NativeWorkspaceSnapshot } from "../native/commands";
import { DEFAULT_DESKTOP_STATE, loadDesktopState, promoteRecentWorkspace, saveDesktopState, type DesktopStateUpdate } from "../settings/desktopState";
import {
  createEditorTab,
  createStaticTab,
  desktopTabReducer,
  initialDesktopTabState,
  type DesktopTab
} from "../tabs/tabModel";
import { createDesktopTabRegistry } from "../tabs/tabRegistry";
import { workspaceDocumentApi } from "../workspace/workspaceDocumentAdapter";
import { workspaceDesktopApi } from "../workspace/workspaceAdapter";
import { loadWorkspaceDocument, saveWorkspaceDocument } from "../workspace/workspaceDocumentModel";
import { WorkspaceExplorer } from "../workspace/WorkspaceExplorer";

type LeftPanel = "explorer" | "search" | "source-control" | "tags" | "extensions";
type RightPanel = "outline" | "backlinks" | "properties" | "assistant";
type BottomPanel = "terminal" | "problems" | "output" | "backlinks";

type DocumentViewState = {
  readonly contents: string;
  readonly phase: "loading" | "ready" | "saving" | "error";
  readonly error: string | null;
};

const leftActions: readonly { id: LeftPanel; label: string; symbol: string }[] = [
  { id: "explorer", label: "Explorer", symbol: "▱" },
  { id: "search", label: "Search", symbol: "⌕" },
  { id: "source-control", label: "Source control", symbol: "⑂" },
  { id: "tags", label: "Tags", symbol: "#" },
  { id: "extensions", label: "Extensions", symbol: "⊞" }
];

const rightActions: readonly { id: RightPanel; label: string; symbol: string }[] = [
  { id: "outline", label: "Outline", symbol: "☷" },
  { id: "backlinks", label: "Backlinks", symbol: "↩" },
  { id: "properties", label: "Properties", symbol: "☰" },
  { id: "assistant", label: "Assistant", symbol: "✦" }
];

const desktopTabRegistry = createDesktopTabRegistry();
const desktopCommandRegistry = createDesktopCommandRegistry();
const AssistantPanel = lazy(async () => {
  const module = await import("../agent/AssistantPanel");
  return { default: module.AssistantPanel };
});
const MarkdownEditor = lazy(async () => {
  const module = await import("../tabs/MarkdownEditor");
  return { default: module.MarkdownEditor };
});

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
  const [theme, setTheme] = useState<"light" | "dark">("dark");
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
    document.documentElement.dataset.thinkbrainTheme = theme;
  }, [theme]);

  useEffect(() => {
    documentsRef.current = documents;
  }, [documents]);

  const updateRecentWorkspacePaths = useCallback((rootPath: string): readonly string[] => {
    const next = promoteRecentWorkspace(recentWorkspacePathsRef.current, rootPath);
    recentWorkspacePathsRef.current = next;
    setRecentWorkspacePaths(next);
    return next;
  }, []);

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
        setTheme((value) => value === "dark" ? "light" : "dark");
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
        dispatchTabs({ type: "open", tab: createStaticTab("settings", "Settings") });
        closePalette();
        return;
      case "rebuild-index":
        setBottomPanel("output");
        closePalette();
        return;
    }
  }, [closePalette, persistDesktopState, selectLeftPanel, showExplorer]);

  const updateDocument = useCallback((tabId: string, contents: string) => {
    setDocuments((current) => {
      const document = current[tabId];
      return document ? { ...current, [tabId]: { ...document, contents, error: null } } : current;
    });
    dispatchTabs({ type: "setDirty", tabId, isDirty: true });
  }, []);

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

  useEffect(() => {
    rootRef.current?.style.setProperty("--tn-shell-left-width", `${leftWidth}px`);
  }, [leftWidth]);

  useEffect(() => {
    rootRef.current?.style.setProperty("--tn-shell-right-width", `${rightWidth}px`);
  }, [rightWidth]);

  const clampPanelWidth = (width: number) => Math.max(224, Math.min(480, width));

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
      <header className="flex items-end bg-titlebar border-b border-border min-w-0">
        <div
          className="flex items-center gap-2 h-full px-3 flex-[0_0_max(10rem,calc(var(--tn-size-activitybar-width)+var(--tn-shell-left-width)))] max-[760px]:flex-[0_0_3rem]"
          aria-label="ThinkBrain"
        >
          <span className="inline-flex items-center justify-center bg-primary text-primary-foreground rounded-small text-[0.625rem] font-extrabold h-4 w-4">
            T
          </span>
          <span className="text-xs font-[650] max-[760px]:hidden">ThinkBrain</span>
        </div>
        <nav className="flex flex-1 items-end gap-[2px] h-full min-w-0 overflow-x-auto" aria-label="Open tabs">
          {tabState.tabs.map((tab) => {
            const isActive = tab.id === activeTab?.id;
            return (
              <div
                key={tab.id}
                className={cn(
                  "flex items-center bg-tab-inactive text-tab-inactive-foreground border-t-2 border-t-transparent rounded-t-small flex-[0_0_clamp(7.5rem,15vw,12.5rem)] max-[760px]:flex-basis-[7.25rem] text-xs h-[calc(100%-3px)] min-w-0 hover:bg-secondary",
                  isActive && "bg-tab-active border-t-primary text-tab-active-foreground"
                )}
              >
                <button
                  type="button"
                  className="flex flex-1 items-center min-w-0 gap-[0.45rem] h-full border-0 py-0 pr-1 pl-[0.65rem] text-inherit bg-transparent cursor-pointer font-inherit text-left focus-visible:text-foreground focus-visible:outline-1 focus-visible:outline-primary focus-visible:-outline-offset-2"
                  onClick={() => dispatchTabs({ type: "activate", tabId: tab.id })}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span aria-hidden="true">{tab.kind === "browser" ? "◉" : tab.kind === "graph" ? "◌" : "▤"}</span>
                  <span className="truncate">{tab.title}</span>
                  {tab.isDirty && <span className="bg-primary rounded-full h-[0.35rem] w-[0.35rem]" aria-label="Unsaved changes" />}
                </button>
                <button
                  type="button"
                  className="border-0 py-0 pr-[0.55rem] pl-[0.2rem] text-inherit bg-transparent cursor-pointer text-base opacity-65 hover:text-foreground hover:opacity-100 focus-visible:text-foreground focus-visible:opacity-100 focus-visible:outline-1 focus-visible:outline-primary focus-visible:-outline-offset-2"
                  aria-label={`Close ${tab.title}`}
                  onClick={() => dispatchTabs({ type: "requestClose", tabId: tab.id })}
                >
                  ×
                </button>
              </div>
            );
          })}
          <button className="bg-transparent border-0 cursor-pointer text-xl h-full min-w-[2.25rem]" aria-label="Open a new tab">+</button>
        </nav>
        <div className="flex items-center border-l border-border gap-[0.125rem] h-full px-1">
          {rightActions.map((action) => (
            <IconButton
              key={action.id}
              label={action.label}
              symbol={action.symbol}
              active={rightPanel === action.id}
              className="max-[760px]:hidden"
              onClick={() => setRightPanel((panel) => panel === action.id ? null : action.id)}
            />
          ))}
          <span className="bg-border h-4 mx-[0.25rem] w-[1px]" />
          <IconButton
            label={`Use ${theme === "dark" ? "light" : "dark"} theme`}
            symbol={theme === "dark" ? "☀" : "◐"}
            onClick={() => setTheme((value) => value === "dark" ? "light" : "dark")}
          />
        </div>
      </header>

      <div className="flex min-h-0 max-[760px]:relative">
        <aside className="flex flex-col justify-between flex-[0_0_3rem] bg-activitybar border-r border-border py-[0.4rem]" aria-label="Workspace sections">
          <div>
            {leftActions.map((action) => (
              <IconButton
                key={action.id}
                label={action.label}
                symbol={action.symbol}
                active={leftPanel === action.id}
                onClick={() => selectLeftPanel(action.id)}
              />
            ))}
          </div>
          <div>
            <IconButton label="Settings" symbol="⚙" onClick={() => selectLeftPanel("extensions")} />
          </div>
        </aside>

        {leftPanel && (
          <>
            <aside
              className="flex flex-col min-w-0 overflow-hidden bg-sidebar border-r border-border flex-[0_0_var(--tn-shell-left-width)] max-[760px]:absolute max-[760px]:z-[2]"
              aria-label={`${leftActions.find((item) => item.id === leftPanel)?.label} panel`}
            >
              {leftPanel === "explorer" ? (
                <WorkspaceExplorer
                  initialWorkspacePath={stateRestored ? restoredWorkspacePath : null}
                  onWorkspaceOpened={handleWorkspaceOpened}
                  onWorkspaceUnavailable={handleWorkspaceUnavailable}
                  onMarkdownFileSelected={openMarkdownDocument}
                  onMarkdownFileCreated={handleMarkdownFileCreated}
                  onNewNoteFocusHandled={acknowledgeNewNoteFocus}
                  newNoteFocusRequest={newNoteFocusRequest}
                  recentWorkspacePaths={recentWorkspacePaths}
                  onWorkspaceLaunched={handleWorkspaceLaunched}
                />
              ) : (
                <>
                  <PanelTitle title={leftActions.find((item) => item.id === leftPanel)?.label ?? "Panel"} />
                  <LeftContent panel={leftPanel} rootPath={restoredWorkspacePath} />
                </>
              )}
            </aside>
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
          {bottomPanel && <BottomContent active={bottomPanel} onChange={setBottomPanel} onClose={() => setBottomPanel(null)} />}
        </section>

        {rightPanel && (
          <>
            <ResizeHandle label="Resize right panel" onPointerDown={beginResize("right")} onKeyDown={resizeWithKeyboard("right")} />
            <aside
              className="flex flex-col min-w-0 overflow-hidden bg-sidebar border-l border-border flex-[0_0_var(--tn-shell-right-width)] max-[760px]:absolute max-[760px]:z-[2]"
              aria-label={`${rightActions.find((item) => item.id === rightPanel)?.label} panel`}
            >
              <PanelTitle title={rightActions.find((item) => item.id === rightPanel)?.label ?? "Panel"} />
              <RightContent panel={rightPanel} />
            </aside>
          </>
        )}
      </div>

      <footer className="flex items-center gap-[0.8rem] px-2 bg-statusbar text-statusbar-foreground text-[0.68rem] overflow-hidden whitespace-nowrap">
        <span className="max-[760px]:hidden">{workspaceName ?? "No workspace open"}</span>
        <span className="max-[760px]:hidden">✓ 0 &nbsp; ⚠ 0</span>
        <span className="max-[760px]:hidden">✦ Indexer unavailable</span>
        <span className="flex-1 max-[760px]:block" />
        <span className="max-[760px]:hidden">{workspaceName ? "Workspace open" : "Open a workspace to begin"}</span>
        <span className="max-[760px]:hidden">Ln —, Col —</span>
        <span className="max-[760px]:hidden">Spaces: —</span>
        <span className="max-[760px]:hidden">UTF-8</span>
        <span className="max-[760px]:hidden">Markdown</span>
        <button
          className={cn(
            "bg-transparent border-0 text-inherit cursor-pointer h-full px-1 hover:bg-[color-mix(in_srgb,white_18%,transparent)]",
            bottomPanel && "bg-[color-mix(in_srgb,white_18%,transparent)]"
          )}
          onClick={() => setBottomPanel((panel) => panel ? null : "terminal")}
          aria-label="Toggle bottom panel"
        >
          ▰
        </button>
      </footer>

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

function IconButton({
  label,
  symbol,
  active,
  className,
  onClick
}: {
  label: string;
  symbol: string;
  active?: boolean;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center w-full h-10 border-0 border-l-2 border-l-transparent bg-transparent text-activitybar-foreground cursor-pointer text-[1.1rem] hover:bg-[color-mix(in_srgb,var(--tn-color-accent)_60%,transparent)] hover:text-activitybar-active",
        active && "bg-[color-mix(in_srgb,var(--tn-color-accent)_60%,transparent)] text-activitybar-active border-l-activitybar-active",
        className
      )}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <span aria-hidden="true">{symbol}</span>
    </button>
  );
}

function ResizeHandle({
  label,
  onPointerDown,
  onKeyDown
}: {
  label: string;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      className="relative flex-[0_0_1px] p-0 border-0 bg-border cursor-col-resize hover:bg-primary focus-visible:bg-primary focus-visible:outline-none max-[760px]:hidden"
      aria-label={`${label}. Use arrow keys to resize.`}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    />
  );
}

function PanelTitle({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between h-[2.25rem] px-3">
      <h2 className="m-0 text-[0.68rem] tracking-[0.08em] uppercase font-semibold">{title}</h2>
      <button className="bg-transparent border-0 cursor-pointer tracking-[0.12em]" aria-label={`More ${title} actions`}>•••</button>
    </div>
  );
}

function LeftContent({ panel, rootPath }: { panel: LeftPanel; rootPath: string | null }) {
  if (panel === "source-control") return <SourceControlPanel rootPath={rootPath} />;
  return (
    <Unavailable
      title={panel}
      description={
        panel === "extensions"
          ? "Extensions will appear here when the capability sandbox is ready."
          : "This workspace surface is not connected yet."
      }
    />
  );
}

function RightContent({ panel }: { panel: RightPanel }) {
  if (panel === "assistant")
    return (
      <Suspense fallback={<Unavailable title="Loading assistant" description="Preparing the assistant panel…" />}>
        <AssistantPanel />
      </Suspense>
    );
  if (panel === "outline") return <Unavailable title="No note selected" description="Headings from the active Markdown note will appear here." />;
  if (panel === "backlinks")
    return <Unavailable title="Backlinks unavailable" description="This inspector activates after the workspace link index is available." />;
  return <Unavailable title="No note selected" description="Read-only frontmatter properties will appear here." />;
}

function TabContent({
  tab,
  document,
  onChange,
  onSave
}: {
  readonly tab: DesktopTab | null;
  readonly document: DocumentViewState | undefined;
  readonly onChange: (tabId: string, contents: string) => void;
  readonly onSave: (tab: DesktopTab) => Promise<boolean>;
}) {
  if (!tab)
    return (
      <div className="grid grid-cols-[3.2rem_minmax(0,1fr)] py-[1.1rem] font-mono text-[0.84rem] leading-[1.65]">
        <span className="text-muted-foreground pr-[0.8rem] text-right select-none">1</span>
        <pre className="m-0 overflow-visible whitespace-pre-wrap">{`# Welcome to ThinkBrain\n\nOpen a workspace, then select a Markdown file to start editing it.`}</pre>
      </div>
    );
  const view = desktopTabRegistry.get(tab.kind);
  if (!view?.isAvailable)
    return <Unavailable title={view?.label ?? tab.title} description={view?.unavailableMessage ?? "This tab type is unavailable."} />;
  if (tab.kind === "browser")
    return <Unavailable title="Browser tab" description="External page rendering is unavailable until the Tauri browser view is connected." />;
  if (tab.kind === "graph")
    return <Unavailable title="Graph view" description="Graph visualization is planned after link indexing is available." />;
  if (tab.kind === "preview")
    return (
      <div className="my-8 mx-auto max-w-[42rem] px-8 leading-[1.6]">
        <h1 className="text-[2rem]">Preview unavailable</h1>
        <p>Open a Markdown note to view its rendered preview.</p>
      </div>
    );
  if (tab.kind === "settings")
    return <Unavailable title="Settings" description="Settings controls will appear here as their owning story is implemented." />;
  if (!document || document.phase === "loading")
    return <Unavailable title="Loading note" description="Reading the Markdown document from the workspace…" />;
  if (document.phase === "error" && !document.contents)
    return <Unavailable title="Could not open note" description={document.error ?? "The Markdown document could not be read."} />;
  return (
    <Suspense fallback={<Unavailable title="Loading editor" description="Preparing the Markdown editor…" />}>
      <MarkdownEditor
        key={tab.id}
        value={document.contents}
        isSaving={document.phase === "saving"}
        error={document.error}
        onChange={(contents) => onChange(tab.id, contents)}
        onSave={() => {
          void onSave(tab);
        }}
      />
    </Suspense>
  );
}

function DirtyCloseDialog({
  tab,
  onCancel,
  onDiscard,
  onSave
}: {
  readonly tab: DesktopTab | null;
  readonly onCancel: () => void;
  readonly onDiscard: () => void;
  readonly onSave: () => void;
}) {
  if (!tab) return null;
  return (
    <div className="fixed inset-0 z-10 flex justify-center items-start pt-[15vh] bg-[rgb(0_0_0_/_42%)]" role="presentation">
      <section
        className="grid gap-3 w-[min(25rem,calc(100vw-2rem))] p-[1.15rem] border border-border rounded-medium text-foreground bg-popover shadow-soft"
        role="dialog"
        aria-modal="true"
        aria-label="Unsaved changes"
      >
        <h2 className="m-0 text-base font-semibold">Save changes to {tab.title}?</h2>
        <p className="m-0 text-muted-foreground text-xs leading-[1.45]">Closing this tab without saving will discard your edits.</p>
        <div className="flex flex-wrap justify-end gap-[0.45rem]">
          <button
            type="button"
            className="border border-border rounded-small py-[0.4rem] px-[0.6rem] text-foreground bg-surface cursor-pointer font-inherit text-xs"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="border border-border rounded-small py-[0.4rem] px-[0.6rem] text-foreground bg-surface cursor-pointer font-inherit text-xs"
            onClick={onDiscard}
          >
            Discard
          </button>
          <button
            type="button"
            className="border border-border rounded-small py-[0.4rem] px-[0.6rem] text-primary-foreground bg-primary cursor-pointer font-inherit text-xs"
            onClick={onSave}
          >
            Save and close
          </button>
        </div>
      </section>
    </div>
  );
}

function BottomContent({
  active,
  onChange,
  onClose
}: {
  active: BottomPanel;
  onChange: (panel: BottomPanel) => void;
  onClose: () => void;
}) {
  return (
    <section className="flex-[0_0_12rem] min-h-[7rem] bg-panel border-t border-border" aria-label="Bottom panel">
      <div className="flex items-center h-8 border-b border-border">
        {(["problems", "output", "terminal", "backlinks"] as const).map((item) => (
          <button
            key={item}
            className={cn(
              "bg-transparent border-0 cursor-pointer text-[0.65rem] h-full tracking-[0.05em] px-[0.7rem] uppercase text-muted-foreground hover:border-b-2 hover:border-b-primary hover:text-foreground",
              active === item && "border-b-2 border-b-primary text-foreground"
            )}
            onClick={() => onChange(item)}
          >
            {item}
          </button>
        ))}
        <span className="flex-1" />
        <button className="bg-transparent border-0 cursor-pointer text-muted-foreground text-sm px-2 hover:text-foreground" onClick={onClose} aria-label="Close bottom panel">
          ×
        </button>
      </div>
      <div className="h-[calc(100%-2rem)] overflow-auto p-[0.65rem_0.85rem] font-mono text-xs leading-[1.6]">
        <Unavailable className="items-start justify-start p-0 text-left" title={`${active} panel`} description="This panel is waiting for its backing service." />
      </div>
    </section>
  );
}

function Unavailable({
  title,
  description,
  className
}: {
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-1 flex-col items-center justify-center p-8 text-center text-muted-foreground", className)}>
      <strong className="text-foreground text-[0.95rem]">{title}</strong>
      <p className="text-xs leading-[1.5] max-w-[22rem]">{description}</p>
    </div>
  );
}
