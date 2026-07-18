import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { AssistantPanel } from "../agent/AssistantPanel";
import { DEFAULT_DESKTOP_STATE, loadDesktopState, saveDesktopState, type DesktopStateUpdate } from "../settings/desktopState";
import { ReadOnlyWorkspaceExplorer } from "../workspace/ReadOnlyWorkspaceExplorer";
import styles from "./DesktopShell.module.css";

type LeftPanel = "explorer" | "search" | "source-control" | "tags" | "extensions";
type RightPanel = "outline" | "backlinks" | "properties" | "assistant";
type BottomPanel = "terminal" | "problems" | "output" | "backlinks";

type Tab = {
  id: string;
  label: string;
  kind: "note" | "browser" | "graph" | "preview";
  dirty?: boolean;
};

const tabs: readonly Tab[] = [
  { id: "welcome", label: "Welcome", kind: "note" },
  { id: "roadmap", label: "Preview", kind: "preview" },
  { id: "browser", label: "Browser", kind: "browser" },
  { id: "graph", label: "Graph", kind: "graph" },
  { id: "welcome-copy", label: "Getting started", kind: "note" }
];

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

export function DesktopShell() {
  const rootRef = useRef<HTMLElement>(null);
  const [activeTab, setActiveTab] = useState("welcome");
  const [leftPanel, setLeftPanel] = useState<LeftPanel | null>("explorer");
  const [rightPanel, setRightPanel] = useState<RightPanel | null>("outline");
  const [bottomPanel, setBottomPanel] = useState<BottomPanel | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [leftWidth, setLeftWidth] = useState(288);
  const [rightWidth, setRightWidth] = useState(320);
  const [restoredWorkspacePath, setRestoredWorkspacePath] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [stateRestored, setStateRestored] = useState(!isTauri());

  useEffect(() => {
    document.documentElement.dataset.thinkbrainTheme = theme;
  }, [theme]);

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

  const handleWorkspaceOpened = useCallback((rootPath: string, snapshot: { readonly workspace: { readonly name: string } }) => {
    setRestoredWorkspacePath(rootPath);
    setWorkspaceName(snapshot.workspace.name);
    persistDesktopState({ lastWorkspacePath: rootPath });
  }, [persistDesktopState]);

  const handleWorkspaceUnavailable = useCallback(() => {
    setRestoredWorkspacePath(null);
    setWorkspaceName(null);
    persistDesktopState({ lastWorkspacePath: null });
  }, [persistDesktopState]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "p") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
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
        setPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectLeftPanel]);

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

  const selectedTab = tabs.find((tab) => tab.id === activeTab) ?? tabs[0]!;

  return (
    <main className={styles.shell} ref={rootRef} aria-label="ThinkBrain desktop workspace">
      <header className={styles.titleBar}>
        <div className={styles.brand} aria-label="ThinkBrain">
          <span className={styles.brandMark}>T</span>
          <span className={styles.brandName}>ThinkBrain</span>
        </div>
        <nav className={styles.tabs} aria-label="Open tabs">
          {tabs.map((tab) => (
            <button key={tab.id} className={`${styles.tab} ${tab.id === activeTab ? styles.tabActive : ""}`} onClick={() => setActiveTab(tab.id)}>
              <span aria-hidden="true">{tab.kind === "browser" ? "◉" : tab.kind === "graph" ? "◌" : "▤"}</span>
              <span className={styles.tabLabel}>{tab.label}</span>
              {tab.dirty && <span className={styles.dirty} aria-label="Unsaved changes" />}
              <span className={styles.tabClose} aria-hidden="true">×</span>
            </button>
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
              <ReadOnlyWorkspaceExplorer
                initialWorkspacePath={stateRestored ? restoredWorkspacePath : null}
                onWorkspaceOpened={handleWorkspaceOpened}
                onWorkspaceUnavailable={handleWorkspaceUnavailable}
              />
            ) : (
              <><PanelTitle title={leftActions.find((item) => item.id === leftPanel)?.label ?? "Panel"} /><LeftContent panel={leftPanel} /></>
            )}
          </aside>
          <ResizeHandle label="Resize left panel" onPointerDown={beginResize("left")} onKeyDown={resizeWithKeyboard("left")} />
        </>}

        <section className={styles.center} aria-label="Note workspace">
          <article className={styles.editor}>
            <div className={styles.breadcrumbs}>{workspaceName ?? "Workspace"} <span>›</span> {selectedTab.label}</div>
            <TabContent tab={selectedTab} />
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

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} onAction={(id) => { if (id === "assistant") setRightPanel("assistant"); if (id === "search") selectLeftPanel("search"); }} />}
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

function LeftContent({ panel }: { panel: LeftPanel }) {
  return <Unavailable title={panel === "source-control" ? "Source control" : panel} description={panel === "extensions" ? "Extensions will appear here when the capability sandbox is ready." : "This workspace surface is not connected yet."} />;
}

function RightContent({ panel }: { panel: RightPanel }) {
  if (panel === "assistant") return <AssistantPanel />;
  if (panel === "outline") return <Unavailable title="No note selected" description="Headings from the active Markdown note will appear here." />;
  if (panel === "backlinks") return <Unavailable title="Backlinks unavailable" description="This inspector activates after the workspace link index is available." />;
  return <Unavailable title="No note selected" description="Read-only frontmatter properties will appear here." />;
}

function TabContent({ tab }: { tab: Tab }) {
  if (tab.kind === "browser") return <Unavailable title="Browser tab" description="External page rendering is unavailable until the Tauri browser view is connected." />;
  if (tab.kind === "graph") return <Unavailable title="Graph view" description="Graph visualization is planned after link indexing is available." />;
  if (tab.kind === "preview") return <div className={styles.preview}><h1>Preview unavailable</h1><p>Open a Markdown note to view its rendered preview.</p></div>;
  return <div className={styles.note}><span>1</span><pre>{`# Welcome to ThinkBrain\n\nOpen a workspace to start browsing and editing your Markdown notes.\n\n## Desktop shell\n\nTabs, inspectors, the command palette, and the assistant panel are ready for their backing services.\n\n## Your notes stay local\n\nThinkBrain reads and writes ordinary Markdown files in the workspace you choose.`}</pre></div>;
}

function BottomContent({ active, onChange, onClose }: { active: BottomPanel; onChange: (panel: BottomPanel) => void; onClose: () => void }) {
  return <section className={styles.bottomPanel} aria-label="Bottom panel"><div className={styles.bottomTabs}>{(["problems", "output", "terminal", "backlinks"] as const).map((item) => <button key={item} className={active === item ? styles.bottomTabActive : ""} onClick={() => onChange(item)}>{item}</button>)}<span /><button onClick={onClose} aria-label="Close bottom panel">×</button></div><div className={styles.bottomContent}><Unavailable title={`${active} panel`} description="This panel is waiting for its backing service." /></div></section>;
}

function CommandPalette({ onClose, onAction }: { onClose: () => void; onAction: (id: string) => void }) {
  const commands = [["Go to File…", "file"], ["Search in Vault", "search"], ["Toggle AI Assistant", "assistant"], ["New Note", "new"]] as const;
  return <div className={styles.paletteBackdrop} role="presentation" onMouseDown={onClose}><section className={styles.palette} role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(event) => event.stopPropagation()}><input autoFocus placeholder="Type a command or file name…" aria-label="Search commands" /><div>{commands.map(([label, id]) => <button key={id} onClick={() => { onAction(id); onClose(); }}><span>›</span>{label}</button>)}</div></section></div>;
}

function Unavailable({ title, description }: { title: string; description: string }) {
  return <div className={styles.unavailable}><strong>{title}</strong><p>{description}</p></div>;
}
