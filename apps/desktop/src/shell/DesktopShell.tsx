import { isTauri } from "@tauri-apps/api/core";
import { lazy, Suspense, useCallback, useEffect, useReducer, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { CommandPalette, type WorkspaceFileResult } from "../commands/CommandPalette";
import { createDesktopCommandRegistry, type DesktopCommand } from "../commands/commandRegistry";
import { SourceControlPanel } from "../git/SourceControlPanel";
import { gitService } from "../git/gitService";
import type { NativeMarkdownFileEntry, NativeWorkspaceSnapshot } from "../native/commands";
import { DEFAULT_DESKTOP_STATE, loadDesktopState, saveDesktopState, type DesktopStateUpdate } from "../settings/desktopState";
import {
  createEditorTab,
  createStaticTab,
  desktopTabReducer,
  initialDesktopTabState,
  type DesktopTab
} from "../tabs/tabModel";
import { createDesktopTabRegistry } from "../tabs/tabRegistry";
import { workspaceDocumentApi } from "../workspace/workspaceDocumentAdapter";
import { loadWorkspaceDocument, saveWorkspaceDocument } from "../workspace/workspaceDocumentModel";
import { WorkspaceExplorer } from "../workspace/WorkspaceExplorer";
import styles from "./DesktopShell.module.css";

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
  const [newNoteFocusRequest, setNewNoteFocusRequest] = useState(0);
  const [stateRestored, setStateRestored] = useState(!isTauri());

  useEffect(() => {
    document.documentElement.dataset.thinkbrainTheme = theme;
  }, [theme]);

  useEffect(() => {
    documentsRef.current = documents;
  }, [documents]);

  useEffect(() => {
    if (!isTauri()) return;

    let active = true;
    void loadDesktopState().then((desktopState) => {
      if (!active) return;
      setRestoredWorkspacePath(desktopState.lastWorkspacePath);
      setLeftPanel(desktopState.explorerOpen ? "explorer" : null);
    }).catch(() => {
      if (active) {
        setRestoredWorkspacePath(DEFAULT_DESKTOP_STATE.lastWorkspacePath);
      }
    }).finally(() => {
      if (active) setStateRestored(true);
    });

    return () => {
      active = false;
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
    void gitService.detectRepository(rootPath);
    persistDesktopState({ lastWorkspacePath: rootPath });
  }, [persistDesktopState]);

  const handleWorkspaceUnavailable = useCallback(() => {
    setRestoredWorkspacePath(null);
    setWorkspaceName(null);
    setWorkspaceFiles([]);
    persistDesktopState({ lastWorkspacePath: null });
  }, [persistDesktopState]);

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
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
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
    <main className={styles.shell} ref={rootRef} aria-label="ThinkBrain desktop workspace">
      <header className={styles.titleBar}>
        <div className={styles.brand} aria-label="ThinkBrain">
          <span className={styles.brandMark}>T</span>
          <span className={styles.brandName}>ThinkBrain</span>
        </div>
        <nav className={styles.tabs} aria-label="Open tabs">
          {tabState.tabs.map((tab) => (
            <div key={tab.id} className={`${styles.tab} ${tab.id === activeTab?.id ? styles.tabActive : ""}`}>
              <button type="button" className={styles.tabSelect} onClick={() => dispatchTabs({ type: "activate", tabId: tab.id })} aria-current={tab.id === activeTab?.id ? "page" : undefined}>
                <span aria-hidden="true">{tab.kind === "browser" ? "◉" : tab.kind === "graph" ? "◌" : "▤"}</span>
                <span className={styles.tabLabel}>{tab.title}</span>
                {tab.isDirty && <span className={styles.dirty} aria-label="Unsaved changes" />}
              </button>
              <button type="button" className={styles.tabClose} aria-label={`Close ${tab.title}`} onClick={() => dispatchTabs({ type: "requestClose", tabId: tab.id })}>×</button>
            </div>
          ))}
          <button className={styles.newTab} aria-label="Open a new tab">+</button>
        </nav>
        <div className={styles.titleActions}>
          {rightActions.map((action) => <IconButton key={action.id} label={action.label} symbol={action.symbol} active={rightPanel === action.id} onClick={() => setRightPanel((panel) => panel === action.id ? null : action.id)} />)}
          <span className={styles.separator} />
          <IconButton label={`Use ${theme === "dark" ? "light" : "dark"} theme`} symbol={theme === "dark" ? "☀" : "◐"} onClick={() => setTheme((value) => value === "dark" ? "light" : "dark")} />
        </div>
      </header>

      <div className={styles.workspace}>
        <aside className={styles.activityBar} aria-label="Workspace sections">
          <div>{leftActions.map((action) => <IconButton key={action.id} label={action.label} symbol={action.symbol} active={leftPanel === action.id} onClick={() => selectLeftPanel(action.id)} />)}</div>
          <div><IconButton label="Settings" symbol="⚙" onClick={() => selectLeftPanel("extensions")} /></div>
        </aside>

        {leftPanel && <>
          <aside className={styles.popout} aria-label={`${leftActions.find((item) => item.id === leftPanel)?.label} panel`}>
            {leftPanel === "explorer" ? (
              <WorkspaceExplorer
                initialWorkspacePath={stateRestored ? restoredWorkspacePath : null}
                onWorkspaceOpened={handleWorkspaceOpened}
                onWorkspaceUnavailable={handleWorkspaceUnavailable}
                onMarkdownFileSelected={openMarkdownDocument}
                onMarkdownFileCreated={handleMarkdownFileCreated}
                onNewNoteFocusHandled={acknowledgeNewNoteFocus}
                newNoteFocusRequest={newNoteFocusRequest}
              />
            ) : (
              <><PanelTitle title={leftActions.find((item) => item.id === leftPanel)?.label ?? "Panel"} /><LeftContent panel={leftPanel} rootPath={restoredWorkspacePath} /></>
            )}
          </aside>
          <ResizeHandle label="Resize left panel" onPointerDown={beginResize("left")} onKeyDown={resizeWithKeyboard("left")} />
        </>}

        <section className={styles.center} aria-label="Note workspace">
          <article className={styles.editor}>
            <div className={styles.breadcrumbs}>{workspaceName ?? "Workspace"} {activeTab && <><span>›</span> {activeTab.title}</>}</div>
            <TabContent tab={activeTab} document={activeTab ? documents[activeTab.id] : undefined} onChange={updateDocument} onSave={saveDocument} />
          </article>
          {bottomPanel && <BottomContent active={bottomPanel} onChange={setBottomPanel} onClose={() => setBottomPanel(null)} />}
        </section>

        {rightPanel && <>
          <ResizeHandle label="Resize right panel" onPointerDown={beginResize("right")} onKeyDown={resizeWithKeyboard("right")} />
          <aside className={styles.popout} aria-label={`${rightActions.find((item) => item.id === rightPanel)?.label} panel`}>
            <PanelTitle title={rightActions.find((item) => item.id === rightPanel)?.label ?? "Panel"} />
            <RightContent panel={rightPanel} />
          </aside>
        </>}
      </div>

      <footer className={styles.statusBar}>
        <span>{workspaceName ?? "No workspace open"}</span><span>✓ 0 &nbsp; ⚠ 0</span><span>✦ Indexer unavailable</span>
        <span className={styles.statusSpacer} />
        <span>{workspaceName ? "Workspace open" : "Open a workspace to begin"}</span><span>Ln —, Col —</span><span>Spaces: —</span><span>UTF-8</span><span>Markdown</span>
        <button className={bottomPanel ? styles.statusActive : ""} onClick={() => setBottomPanel((panel) => panel ? null : "terminal")} aria-label="Toggle bottom panel">▰</button>
      </footer>

      {paletteOpen && <CommandPalette commands={desktopCommandRegistry.entries()} files={workspaceFiles.map((file): WorkspaceFileResult => ({ rootPath: restoredWorkspacePath ?? "", relativePath: file.relative_path })).filter((file) => Boolean(file.rootPath))} onClose={closePalette} onCommand={handlePaletteCommand} onOpenFile={(file) => openMarkdownDocument(file.rootPath, file.relativePath)} />}
      {tabState.closeRequest && <DirtyCloseDialog tab={tabState.tabs.find((tab) => tab.id === tabState.closeRequest?.tabId) ?? null} onCancel={() => dispatchTabs({ type: "cancelClose", tabId: tabState.closeRequest!.tabId })} onDiscard={() => dispatchTabs({ type: "discardClose", tabId: tabState.closeRequest!.tabId })} onSave={async () => { const tab = tabState.tabs.find((candidate) => candidate.id === tabState.closeRequest?.tabId); if (tab && await saveDocument(tab)) dispatchTabs({ type: "completeSaveAndClose", tabId: tab.id }); }} />}
    </main>
  );
}

function IconButton({ label, symbol, active, onClick }: { label: string; symbol: string; active?: boolean; onClick: () => void }) {
  return <button type="button" className={`${styles.iconButton} ${active ? styles.iconButtonActive : ""}`} onClick={onClick} aria-label={label} title={label}><span aria-hidden="true">{symbol}</span></button>;
}

function ResizeHandle({ label, onPointerDown, onKeyDown }: { label: string; onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void; onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void }) {
  return <button type="button" className={styles.resizeHandle} aria-label={`${label}. Use arrow keys to resize.`} onPointerDown={onPointerDown} onKeyDown={onKeyDown} />;
}

function PanelTitle({ title }: { title: string }) {
  return <div className={styles.panelTitle}><h2>{title}</h2><button aria-label={`More ${title} actions`}>•••</button></div>;
}

function LeftContent({ panel, rootPath }: { panel: LeftPanel; rootPath: string | null }) {
  if (panel === "source-control") return <SourceControlPanel rootPath={rootPath} />;
  return <Unavailable title={panel} description={panel === "extensions" ? "Extensions will appear here when the capability sandbox is ready." : "This workspace surface is not connected yet."} />;
}

function RightContent({ panel }: { panel: RightPanel }) {
  if (panel === "assistant") return <Suspense fallback={<Unavailable title="Loading assistant" description="Preparing the assistant panel…" />}><AssistantPanel /></Suspense>;
  if (panel === "outline") return <Unavailable title="No note selected" description="Headings from the active Markdown note will appear here." />;
  if (panel === "backlinks") return <Unavailable title="Backlinks unavailable" description="This inspector activates after the workspace link index is available." />;
  return <Unavailable title="No note selected" description="Read-only frontmatter properties will appear here." />;
}

function TabContent({ tab, document, onChange, onSave }: {
  readonly tab: DesktopTab | null;
  readonly document: DocumentViewState | undefined;
  readonly onChange: (tabId: string, contents: string) => void;
  readonly onSave: (tab: DesktopTab) => Promise<boolean>;
}) {
  if (!tab) return <div className={styles.note}><span>1</span><pre>{`# Welcome to ThinkBrain\n\nOpen a workspace, then select a Markdown file to start editing it.`}</pre></div>;
  const view = desktopTabRegistry.get(tab.kind);
  if (!view?.isAvailable) return <Unavailable title={view?.label ?? tab.title} description={view?.unavailableMessage ?? "This tab type is unavailable."} />;
  if (tab.kind === "browser") return <Unavailable title="Browser tab" description="External page rendering is unavailable until the Tauri browser view is connected." />;
  if (tab.kind === "graph") return <Unavailable title="Graph view" description="Graph visualization is planned after link indexing is available." />;
  if (tab.kind === "preview") return <div className={styles.preview}><h1>Preview unavailable</h1><p>Open a Markdown note to view its rendered preview.</p></div>;
  if (tab.kind === "settings") return <Unavailable title="Settings" description="Settings controls will appear here as their owning story is implemented." />;
  if (!document || document.phase === "loading") return <Unavailable title="Loading note" description="Reading the Markdown document from the workspace…" />;
  if (document.phase === "error" && !document.contents) return <Unavailable title="Could not open note" description={document.error ?? "The Markdown document could not be read."} />;
  return <Suspense fallback={<Unavailable title="Loading editor" description="Preparing the Markdown editor…" />}><MarkdownEditor key={tab.id} value={document.contents} isSaving={document.phase === "saving"} error={document.error} onChange={(contents) => onChange(tab.id, contents)} onSave={() => { void onSave(tab); }} /></Suspense>;
}

function DirtyCloseDialog({ tab, onCancel, onDiscard, onSave }: {
  readonly tab: DesktopTab | null;
  readonly onCancel: () => void;
  readonly onDiscard: () => void;
  readonly onSave: () => void;
}) {
  if (!tab) return null;
  return <div className={styles.paletteBackdrop} role="presentation"><section className={styles.closeDialog} role="dialog" aria-modal="true" aria-label="Unsaved changes"><h2>Save changes to {tab.title}?</h2><p>Closing this tab without saving will discard your edits.</p><div><button type="button" onClick={onCancel}>Cancel</button><button type="button" onClick={onDiscard}>Discard</button><button type="button" onClick={onSave}>Save and close</button></div></section></div>;
}

function BottomContent({ active, onChange, onClose }: { active: BottomPanel; onChange: (panel: BottomPanel) => void; onClose: () => void }) {
  return <section className={styles.bottomPanel} aria-label="Bottom panel"><div className={styles.bottomTabs}>{(["problems", "output", "terminal", "backlinks"] as const).map((item) => <button key={item} className={active === item ? styles.bottomTabActive : ""} onClick={() => onChange(item)}>{item}</button>)}<span /><button onClick={onClose} aria-label="Close bottom panel">×</button></div><div className={styles.bottomContent}><Unavailable title={`${active} panel`} description="This panel is waiting for its backing service." /></div></section>;
}

function Unavailable({ title, description }: { title: string; description: string }) {
  return <div className={styles.unavailable}><strong>{title}</strong><p>{description}</p></div>;
}
