import { ArrowLeft, ArrowRight, Menu } from "lucide-react";

import { PhoneBreadcrumb } from "./PhoneBreadcrumb";

/**
 * Universal phone header — browser chrome.
 *
 * Back stays dimmed at the stack root; Forward appears only while the
 * navigation history has a forward entry. Between the navigation controls
 * and the right-hand controls sits the location pill: a breadcrumb that
 * keeps the current file visible and opens the full scrollable path on tap.
 *
 * The two right-hand controls open different surfaces: the count opens the tab
 * switcher, `☰` opens the navigation drawer; the floating bubbles carry the
 * document-level actions (New note, action items).
 */
export function PhoneHeader({
  breadcrumbs,
  canGoBack,
  canGoForward,
  tabCount,
  mainMenuOpen,
  badge = 0,
  onBack,
  onForward,
  onOpenTabs,
  onToggleMainMenu
}: {
  readonly breadcrumbs: readonly string[];
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  readonly tabCount: number;
  readonly mainMenuOpen: boolean;
  /** Undismissed-conflict count shown on the menu button, hidden at zero. */
  readonly badge?: number;
  readonly onBack: () => void;
  readonly onForward: () => void;
  readonly onOpenTabs: () => void;
  readonly onToggleMainMenu: () => void;
}) {
  const button =
    "flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-small border-0 bg-transparent text-titlebar-foreground tn-focus-ring active:bg-accent disabled:cursor-default disabled:opacity-40";
  return (
    // `min-h-14` (not `h-14`) so the safe-area inset is added *on top of* the
    // 56px content area, not carved out of it. With `box-sizing: border-box`
    // a fixed `h-14` includes the padding, so a 24px status-bar inset would
    // squeeze the buttons into 32px.
    <header className="flex min-h-14 shrink-0 items-center justify-between gap-1 border-b border-border bg-titlebar px-1 pt-[env(safe-area-inset-top)] text-titlebar-foreground">
      <div className="flex shrink-0 items-center">
        <button
          type="button"
          aria-label="Back"
          disabled={!canGoBack}
          className={button}
          onClick={onBack}
        >
          <ArrowLeft aria-hidden="true" className="size-5" />
        </button>
        {canGoForward && (
          <button
            type="button"
            aria-label="Forward"
            className={button}
            onClick={onForward}
          >
            <ArrowRight aria-hidden="true" className="size-5" />
          </button>
        )}
      </div>

      <PhoneBreadcrumb segments={breadcrumbs} />

      <div className="flex min-w-0 items-center gap-0.5">
        <button
          type="button"
          aria-label={`Open tabs (${tabCount})`}
          className={button}
          onClick={onOpenTabs}
        >
          <span
            aria-hidden="true"
            className="flex size-6 items-center justify-center rounded-small border-2 border-current text-[0.7rem] font-bold"
          >
            {tabCount}
          </span>
        </button>
        <button
          type="button"
          // The badge chip is aria-hidden, so the conflict count rides the
          // accessible name — otherwise a counted badge reads as a bare menu.
          aria-label={badge > 0 ? `Main menu, ${badge} conflicts` : "Main menu"}
          aria-haspopup="dialog"
          aria-expanded={mainMenuOpen}
          className={`relative ${button} aria-expanded:bg-accent`}
          onClick={onToggleMainMenu}
        >
          <Menu aria-hidden="true" className="size-5" />
          {badge > 0 && (
            <span
              aria-hidden="true"
              className="absolute top-1 right-1 rounded-full bg-danger px-1 text-[0.6rem] font-bold leading-3.5 text-danger-foreground"
            >
              {badge}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
