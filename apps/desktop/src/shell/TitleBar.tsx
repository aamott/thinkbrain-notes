import { cn } from "../lib/utils";
import type { DesktopTab } from "../tabs/tabModel";
import { useRightPanelContributions } from "../panels/panelRegistry";
import { IconButton } from "./IconButton";
import { type RightPanel } from "./shellTypes";

/**
 * Props for the {@link TitleBar} component.
 *
 * The title bar is the top row of the desktop shell. It owns the app identity
 * label, the open-tab strip, and the right-side panel toggles (outline,
 * backlinks, properties, assistant). All state is
 * owned by the parent shell; this component is presentational and reports
 * user intent through the supplied callbacks.
 */
type TitleBarProps = {
  /** Open tabs, in display order. */
  readonly tabs: readonly DesktopTab[];
  /** Id of the currently active tab, or `null` when none is active. */
  readonly activeTabId: string | null;
  /** Currently open right panel, or `null` when the right dock is collapsed. */
  readonly rightPanel: RightPanel | null;
  /** Called when the user clicks a tab to activate it. */
  readonly onSelectTab: (tabId: string) => void;
  /** Called when the user clicks a tab's close affordance. */
  readonly onRequestCloseTab: (tabId: string) => void;
  /** Called when the user toggles a right-dock panel button. */
  readonly onToggleRightPanel: (panel: RightPanel) => void;
  /** Called when the user clicks the command palette entry point. */
  readonly onOpenCommandPalette: () => void;
};

/**
 * Top-of-window title bar for the desktop shell.
 *
 * Renders three sections in a single `<header>` row:
 *  1. App identity (icon + "ThinkBrain" label) and command palette button,
 *     sized to track the activity bar plus the left sidebar width.
 *  2. The tab strip — a horizontally scrolling `<nav>` mapping each open
 *     {@link DesktopTab} to a tab chip with active styling, a dirty indicator,
 *     and a close button, followed by a "+" new-tab affordance.
 *  3. The right action group — the registered right-panel contributions mapped
 *     to {@link IconButton} toggles.
 *
 * The component keeps the exact Tailwind classes used by the original
 * inline implementation in `DesktopShell.tsx`; only the event wiring is
 * rerouted through the callback props.
 */
export function TitleBar({
  tabs,
  activeTabId,
  rightPanel,
  onSelectTab,
  onRequestCloseTab,
  onToggleRightPanel,
  onOpenCommandPalette
}: TitleBarProps) {
  const rightPanels = useRightPanelContributions();

  return (
    <header className="flex items-end bg-titlebar border-b border-border min-w-0">
      {/* App identity + command palette. */}
      <div
        className="flex items-center gap-2 h-full px-2 pl-3 flex-[0_0_max(10rem,calc(var(--tn-size-activitybar-width)+var(--tn-shell-left-width)))] max-[760px]:flex-[0_0_3rem]"
        aria-label="ThinkBrain"
      >
        <span className="inline-flex items-center justify-center bg-primary text-primary-foreground rounded-small text-[0.625rem] font-extrabold h-4 w-4">
          T
        </span>
        <span className="text-xs font-[650] max-[760px]:hidden">ThinkBrain</span>
        <button
          type="button"
          className="flex items-center justify-center h-[1.6rem] w-[1.6rem] border-0 rounded-small bg-transparent text-activitybar-foreground text-[1.1rem] cursor-pointer hover:bg-[color-mix(in_srgb,var(--tn-color-accent)_60%,transparent)] hover:text-activitybar-active focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-1 max-[760px]:hidden"
          aria-label="Command palette (Ctrl+P)"
          title="Command palette (Ctrl+P)"
          onClick={onOpenCommandPalette}
        >
          <span aria-hidden="true">⌘</span>
        </button>
      </div>

      {/* Tab strip — maps over open tabs with active/dirty/close affordances. */}
      <nav className="flex flex-1 items-end gap-[2px] h-full min-w-0 overflow-x-auto" aria-label="Open tabs">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
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
                onClick={() => onSelectTab(tab.id)}
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
                onClick={() => onRequestCloseTab(tab.id)}
              >
                ×
              </button>
            </div>
          );
        })}
        <button className="bg-transparent border-0 cursor-pointer text-xl h-full min-w-[2.25rem]" aria-label="Open a new tab">+</button>
      </nav>

      {/* Right action group — panel toggles. */}
      <div className="flex items-center border-l border-border gap-2 h-full px-1">
        {rightPanels.map((action) => (
          <IconButton
            key={action.id}
            label={action.label}
            symbol={action.icon}
            active={rightPanel === action.id}
            className="max-[760px]:hidden"
            onClick={() => onToggleRightPanel(action.id)}
          />
        ))}
      </div>
    </header>
  );
}
