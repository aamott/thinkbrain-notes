import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, MoreHorizontal, Pin, Plus } from "lucide-react";
import { cn } from "../lib/utils";
import { tabAccessibleName, type DesktopTab } from "../tabs/tabModel";
import { useRightPanelContributions, type RightPanelContribution } from "../panels/panelRegistryModel";
import { useNotificationStore } from "../notifications/notificationStore";
import { useSettingsStore } from "../settings/settingsStore";
import { mediaQueryList, useMediaQuery } from "../lib/useMediaQuery";
import { IconButton } from "./IconButton";
import { Menu, MenuButton, MenuSeparator, MENU_ITEM, type MenuCloseReason, type MenuPosition } from "./Menu";
import { PanelIcon } from "./panelIcons";
import { type RightPanel } from "./shellTypes";
import {
  parsePinnedActionItems,
  resolveActionItems,
  serializePinnedActionItems
} from "./actionItemsModel";
import { WorkspaceSelectorOutlet } from "../workspace/WorkspaceSelectorPortal";

/**
 * Back/Forward chrome: the ⌘ command-palette button's sizing, with hover
 * gated on `enabled` so a disabled button gives no affordance feedback.
 */
const NAV_BUTTON =
  "flex items-center justify-center h-[1.6rem] w-[1.6rem] border-0 rounded-small bg-transparent text-titlebar-foreground cursor-pointer enabled:hover:bg-[color-mix(in_srgb,var(--tn-color-accent)_60%,transparent)] enabled:hover:text-activitybar-active focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-1 disabled:cursor-default disabled:opacity-40";

/**
 * Props for the {@link TitleBar} component.
 *
 * The title bar is the top row of the desktop shell. It owns the app identity
 * or workspace selector, command palette entry point, open-tab strip, and the
 * right-side panel toggles (outline, backlinks, properties, assistant). All
 * state is owned by the parent shell; this component is presentational and reports
 * user intent through the supplied callbacks.
 */
type TitleBarProps = {
  /** Open tabs, in display order. */
  readonly tabs: readonly DesktopTab[];
  /** Id of the currently active tab, or `null` when none is active. */
  readonly activeTabId: string | null;
  /** Currently open right panel, or `null` when the right dock is collapsed. */
  readonly rightPanel: RightPanel | null;
  readonly showWorkspaceSelector: boolean;
  /** Whether tab-activation history has a previous tab Back can return to. */
  readonly canGoBack: boolean;
  /** Whether a Forward visit exists after Back moved the history cursor. */
  readonly canGoForward: boolean;
  /** Called when the user clicks Back. */
  readonly onBack: () => void;
  /** Called when the user clicks Forward. */
  readonly onForward: () => void;
  /** Called when the user clicks a tab to activate it. */
  readonly onSelectTab: (tabId: string) => void;
  /** Called when the user clicks a tab's close affordance. */
  readonly onRequestCloseTab: (tabId: string) => void;
  /** Called when the user double-clicks a tab, keeping a preview open. */
  readonly onKeepTab: (tabId: string) => void;
  /** Called when the user clicks the strip's "+" affordance. */
  readonly onNewTab: () => void;
  /** Called when the user toggles a right-dock panel button. */
  readonly onToggleRightPanel: (panel: RightPanel) => void;
  /** Called when the user clicks the command palette entry point. */
  readonly onOpenCommandPalette: () => void;
};

/**
 * Top-of-window title bar for the desktop shell.
 *
 * Renders three sections in a single `<header>` row:
 *  1. App identity or workspace selector, plus the command palette button,
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
  showWorkspaceSelector,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onSelectTab,
  onRequestCloseTab,
  onKeepTab,
  onNewTab,
  onToggleRightPanel,
  onOpenCommandPalette
}: TitleBarProps) {
  const rightPanels = useRightPanelContributions();
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsTriggerRef = useRef<HTMLButtonElement>(null);
  // Right-click on a bar icon raises this pointer-placed menu for pin control.
  const [pinMenu, setPinMenu] = useState<(MenuPosition & { panel: RightPanelContribution }) | null>(null);

  // The ⋯ menu shows every panel below 900px (the icon row is hidden there)
  // and only the unpinned remainder above it — the pinned icons are already
  // on the bar. This is the only place JS reads the breakpoint.
  const narrow = !useMediaQuery("(min-width: 901px)");
  // An open menu on a display:none trigger is a focus trap — close it when
  // the bar widens past the breakpoint (the setState stays inside the media
  // query's change callback, which is where external-system updates belong).
  useEffect(() => {
    const wide = mediaQueryList("(min-width: 901px)");
    if (!wide) return;
    const close = (event: MediaQueryListEvent) => {
      if (event.matches) setActionsOpen(false);
    };
    wide.addEventListener("change", close);
    return () => wide.removeEventListener("change", close);
  }, []);

  // Which panels keep a title-bar icon. Blank/corrupt settings fall back to
  // the built-in default; an explicit empty list is honoured (everything goes
  // to the ⋯ menu).
  const pinnedRaw = useSettingsStore((state) => state.getEffectiveValue("ui.pinnedActionItems"));
  const setSettingImmediately = useSettingsStore((state) => state.setSettingImmediately);
  const pinned = useMemo(() => parsePinnedActionItems(pinnedRaw), [pinnedRaw]);
  const togglePin = (id: string) => {
    const next = new Set(pinned);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    void setSettingImmediately("ui.pinnedActionItems", serializePinnedActionItems(next));
  };

  // Undismissed notifications keyed by the panel they are about. A notified
  // panel's icon surfaces even unpinned, wearing the count, and leaves again
  // when the last entry for it is dismissed.
  const notifications = useNotificationStore((state) => state.notifications);
  const notified = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of notifications) {
      if (item.panel && !item.dismissed) {
        counts.set(item.panel, (counts.get(item.panel) ?? 0) + 1);
      }
    }
    return counts;
  }, [notifications]);

  const { visible, overflow } = useMemo(
    () => resolveActionItems(rightPanels, pinned, new Set(notified.keys())),
    [rightPanels, pinned, notified]
  );
  // Below 900px the ⋯ menu lists every panel — the icons it would have
  // duplicated are display:none.
  const menuPanels = narrow ? rightPanels : overflow;

  const closeActions = (reason: MenuCloseReason): void => {
    setActionsOpen(false);
    // Escape means "take me back"; an outside click already chose its focus.
    if (reason === "escape") actionsTriggerRef.current?.focus();
  };

  // Per-tab DOM nodes keyed by tab id, so the active tab can be scrolled into
  // view without querying the document.
  const tabElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  // The tab strip scrolls horizontally; translate vertical wheel motion into
  // horizontal scroll so the scroll wheel moves tabs sideways. Attached as a
  // non-passive native listener so preventDefault works (React's onWheel is
  // passive at the root and would warn / no-op on preventDefault).
  const tabStripRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = tabStripRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Only translate when the user is scrolling vertically (the common case
      // for a mouse wheel) and there's no explicit horizontal trackpad motion.
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Scroll the active tab into view whenever it changes. Skips if the tab is
  // already fully visible so it doesn't fight the user's scroll position when
  // clicking visible tabs. Computes scrollLeft manually (getBoundingClientRect
  // is reliable across webviews; scrollIntoView is flaky for horizontal
  // containers in WebKitGTK) and animates via scrollTo({ behavior: "smooth" }).
  useLayoutEffect(() => {
    if (activeTabId === null) return;
    const tab = tabElementsRef.current.get(activeTabId);
    const strip = tabStripRef.current;
    if (!tab || !strip) return;
    const rel = tab.getBoundingClientRect().left - strip.getBoundingClientRect().left;
    if (rel >= 0 && rel + tab.offsetWidth <= strip.clientWidth) return;
    const max = strip.scrollWidth - strip.clientWidth;
    const left = Math.max(0, Math.min(rel - 8 + strip.scrollLeft, max));
    strip.scrollTo({ left, behavior: "smooth" });
  }, [activeTabId]);

  // Edge shadows tell the reader there are more tabs off-screen; each fades
  // out as the strip reaches that end. Driven by scroll position rather than
  // pointer state so they are correct without hovering.
  const [scrollEdges, setScrollEdges] = useState({ left: false, right: false });
  const measureScrollEdges = useCallback(() => {
    const el = tabStripRef.current;
    if (!el) return;
    setScrollEdges({
      left: el.scrollLeft > 1,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    });
  }, []);
  useLayoutEffect(() => {
    measureScrollEdges();
    const el = tabStripRef.current;
    if (!el || typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(measureScrollEdges);
    observer.observe(el);
    return () => observer.disconnect();
  }, [tabs, measureScrollEdges]);

  return (
    <header className="flex items-end bg-titlebar border-b border-border min-w-0">
      {/* App identity or workspace selector + command palette. Back/Forward
          live inside this fixed-width block so the tab strip's left edge stays
          aligned with the left popout no matter how many items join the row.
          Both buttons always render — a toggling Forward would shift the
          workspace selector. The row hides under the 760px collapse, where the
          block shrinks to 3rem and can't fit it. */}
      <div
        className="flex items-center gap-2 h-full pl-3 pr-2 flex-[0_0_max(10rem,calc(var(--tn-size-activitybar-width)+var(--tn-shell-left-width)))] max-[760px]:flex-[0_0_3rem]"
        aria-label={showWorkspaceSelector ? "Workspace and commands" : "ThinkBrain"}
      >
        <div className="flex items-center gap-0.5 max-[760px]:hidden">
          <button
            type="button"
            className={NAV_BUTTON}
            aria-label="Back"
            title="Back"
            disabled={!canGoBack}
            onClick={onBack}
          >
            <ArrowLeft aria-hidden="true" className="size-[0.95rem]" />
          </button>
          <button
            type="button"
            className={NAV_BUTTON}
            aria-label="Forward"
            title="Forward"
            disabled={!canGoForward}
            onClick={onForward}
          >
            <ArrowRight aria-hidden="true" className="size-[0.95rem]" />
          </button>
        </div>
        {showWorkspaceSelector ? (
          <WorkspaceSelectorOutlet variant="titlebar" />
        ) : (
          <>
            <span className="inline-flex items-center justify-center bg-primary text-primary-foreground rounded-small text-[0.625rem] font-extrabold h-4 w-4">
              T
            </span>
            <span className="text-xs font-[650] max-[760px]:hidden">ThinkBrain</span>
          </>
        )}
        <button
          type="button"
          className="flex items-center justify-center h-[1.6rem] w-[1.6rem] border-0 rounded-small bg-transparent text-titlebar-foreground text-[1.1rem] cursor-pointer hover:bg-[color-mix(in_srgb,var(--tn-color-accent)_60%,transparent)] hover:text-activitybar-active focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-1 max-[760px]:hidden"
          aria-label="Command palette (Ctrl/Cmd+P)"
          title="Command palette (Ctrl/Cmd+P)"
          onClick={onOpenCommandPalette}
        >
          <span aria-hidden="true">⌘</span>
        </button>
      </div>

      {/* Tab strip — maps over open tabs with active/dirty/close affordances.
          The wrapper carries the scroll-edge shadows so they overlay the
          strip without taking part in its layout. */}
      <div className="relative min-w-0 flex-1 self-stretch">
        <nav
          ref={tabStripRef}
          className="tn-scrollbar-none flex items-end gap-0.5 h-full min-w-0 overflow-x-auto"
          aria-label="Open tabs"
          onScroll={measureScrollEdges}
        >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          // Restore previews of one file share a title; the accessible name
          // and tooltip carry the version's date so they stay distinct.
          const accessibleName = tabAccessibleName(tab);
          return (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              ref={(el) => {
                if (el) tabElementsRef.current.set(tab.id, el);
                else tabElementsRef.current.delete(tab.id);
              }}
              className={cn(
                "flex items-center bg-tab-inactive text-tab-inactive-foreground border-t-2 border-t-transparent rounded-t-small flex-[0_0_clamp(7.5rem,15vw,12.5rem)] max-[760px]:flex-basis-[7.25rem] text-xs h-[calc(100%-3px)] min-w-0 hover:bg-secondary",
                isActive && "bg-tab-active border-t-primary text-tab-active-foreground"
              )}
            >
              <button
                type="button"
                className="flex flex-1 items-center min-w-0 gap-[0.45rem] h-full border-0 py-0 pr-1 pl-[0.65rem] text-inherit bg-transparent cursor-pointer font-inherit text-left focus-visible:text-foreground focus-visible:outline-1 focus-visible:outline-primary focus-visible:-outline-offset-2"
                onClick={() => onSelectTab(tab.id)}
                onDoubleClick={() => onKeepTab(tab.id)}
                // Only restore tabs get an explicit name: an explicit
                // aria-label would override the dirty dot's "Unsaved changes"
                // descendant on ordinary tabs.
                aria-label={tab.kind === "version-diff" ? accessibleName : undefined}
                title={accessibleName}
                aria-current={isActive ? "page" : undefined}
              >
                <span aria-hidden="true">{tab.kind === "browser" ? "◉" : tab.kind === "graph" ? "◌" : "▤"}</span>
                {/* Italic marks a provisional tab — the file the next click
                    replaces until an edit keeps it. */}
                <span className={cn("truncate", tab.preview && "italic")}>{tab.title}</span>
                {tab.isDirty && <span className="bg-primary rounded-full h-[0.35rem] w-[0.35rem]" aria-label="Unsaved changes" />}
              </button>
              <button
                type="button"
                className="border-0 py-0 pr-[0.55rem] pl-[0.2rem] text-inherit bg-transparent cursor-pointer text-base opacity-65 hover:text-foreground hover:opacity-100 focus-visible:text-foreground focus-visible:opacity-100 focus-visible:outline-1 focus-visible:outline-primary focus-visible:-outline-offset-2"
                aria-label={`Close ${accessibleName}`}
                onClick={() => onRequestCloseTab(tab.id)}
              >
                ×
              </button>
            </div>
          );
        })}
        {/* Sits inside the strip so it scrolls with the tabs and stays where
            the next tab would open, like a browser's "+" button. */}
        <button
          type="button"
          aria-label="New tab"
          title="New tab"
          onClick={onNewTab}
          className="flex h-[calc(100%-3px)] w-7 shrink-0 cursor-pointer items-center justify-center self-end rounded-t-small border-t-2 border-t-transparent bg-transparent text-titlebar-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-1"
        >
          <Plus aria-hidden="true" className="size-[0.9rem]" />
        </button>
        </nav>
        {/* The nav scrolls underneath; the fades sit over its ends. */}
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-titlebar to-transparent transition-opacity duration-150",
            scrollEdges.left ? "opacity-100" : "opacity-0"
          )}
        />
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-titlebar to-transparent transition-opacity duration-150",
            scrollEdges.right ? "opacity-100" : "opacity-0"
          )}
        />
      </div>

      {/* Right action group — pinned panel toggles plus a ⋯ menu for the
          rest. Below 900px the icon row is hidden and the ⋯ menu lists every
          panel, so a narrow window keeps every action reachable instead of
          clipping them off the edge. A panel with a waiting notification
          surfaces in the row unpinned, wearing the count. */}
      <div className="relative flex shrink-0 items-center border-l border-border gap-1 h-full px-2">
        <div className="flex items-center gap-1 max-[900px]:hidden">
          {visible.map((action) => (
            <IconButton
              key={action.id}
              label={action.label}
              symbol={action.icon}
              active={rightPanel === action.id}
              badge={notified.get(action.id)}
              className="w-[1.6rem] h-[1.6rem] border-l-0 rounded-small text-titlebar-foreground"
              onClick={() => onToggleRightPanel(action.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                setPinMenu({ x: event.clientX, y: event.clientY, panel: action });
              }}
            />
          ))}
        </div>
        <button
          ref={actionsTriggerRef}
          type="button"
          className={cn(
            "relative items-center justify-center w-[1.6rem] h-[1.6rem] border-0 rounded-small bg-transparent text-titlebar-foreground cursor-pointer hover:bg-[color-mix(in_srgb,var(--tn-color-accent)_60%,transparent)] hover:text-activitybar-active focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-1",
            // At ≥900px the ⋯ earns its keep only when unpinned panels exist;
            // under 900px it is always the only way in.
            overflow.length > 0 ? "inline-flex" : "hidden max-[900px]:inline-flex"
          )}
          aria-label="Action items"
          aria-expanded={actionsOpen}
          aria-controls="desktop-action-items-menu"
          title="Action items"
          onClick={() => setActionsOpen((open) => !open)}
        >
          <MoreHorizontal aria-hidden="true" className="size-[0.95rem]" />
          {notified.size > 0 && (
            <span
              aria-hidden="true"
              className="absolute right-0 top-0 min-w-3.5 rounded-full bg-primary px-0.5 text-center text-[0.55rem] leading-3.5 text-primary-foreground"
            >
              {[...notified.values()].reduce((sum, count) => sum + count, 0)}
            </span>
          )}
        </button>
        {actionsOpen && (
          <Menu
            id="desktop-action-items-menu"
            anchorRef={actionsTriggerRef}
            className="absolute right-2 top-[calc(100%+0.25rem)] z-50"
            onClose={closeActions}
          >
            {menuPanels.map((action) => {
              const isPinned = pinned.has(action.id);
              const pinLabel = isPinned ? `Unpin ${action.label}` : `Pin ${action.label}`;
              return (
                <div key={action.id} className="flex min-w-0 items-stretch">
                  <MenuButton
                    label={action.label}
                    className="flex-1"
                    icon={<PanelIcon name={action.icon} />}
                    current={rightPanel === action.id}
                    title={action.label}
                    onClick={() => {
                      setActionsOpen(false);
                      onToggleRightPanel(action.id);
                    }}
                  />
                  {/* A toggle, not a navigation — the menu stays open so the
                      icon moving between sections is visible feedback. */}
                  <button
                    type="button"
                    className={cn(
                      MENU_ITEM,
                      "w-auto flex-none px-2",
                      isPinned ? "text-foreground" : "text-muted-foreground"
                    )}
                    role="menuitem"
                    aria-label={pinLabel}
                    title={pinLabel}
                    onClick={() => togglePin(action.id)}
                  >
                    <Pin aria-hidden="true" className={cn("size-[0.85rem]", isPinned && "fill-current")} />
                  </button>
                </div>
              );
            })}
          </Menu>
        )}
        {pinMenu && (
          <Menu
            at={pinMenu}
            label={`${pinMenu.panel.label} options`}
            onClose={() => setPinMenu(null)}
          >
            <MenuButton
              label={`Open ${pinMenu.panel.label}`}
              icon={<PanelIcon name={pinMenu.panel.icon} />}
              onClick={() => {
                setPinMenu(null);
                onToggleRightPanel(pinMenu.panel.id);
              }}
            />
            <MenuSeparator />
            <MenuButton
              label={pinned.has(pinMenu.panel.id) ? "Unpin from title bar" : "Pin to title bar"}
              icon={<Pin className={pinned.has(pinMenu.panel.id) ? "fill-current" : ""} />}
              onClick={() => {
                setPinMenu(null);
                togglePin(pinMenu.panel.id);
              }}
            />
          </Menu>
        )}
      </div>
    </header>
  );
}
