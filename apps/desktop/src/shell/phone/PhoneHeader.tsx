import { ArrowLeft, ArrowRight, MoreHorizontal } from "lucide-react";

import { PhoneBreadcrumb } from "./PhoneBreadcrumb";

/**
 * Universal phone header — browser chrome.
 *
 * Back and Forward render in the header by default and stay dimmed at their
 * stack boundary rather than hidden, so the enabled layout never reflows.
 * `showHistoryControls={false}` omits them entirely for an alternate
 * presentation elsewhere. Between the nav
 * pair and the right-hand controls sits the location pill: a breadcrumb that
 * keeps the current file visible and opens the full scrollable path on tap.
 *
 * The two right-hand controls open different surfaces: the count opens the tab
 * switcher, `⋯` opens the action-items menu; the hub's Menu slot is the only
 * launcher for the navigation drawer.
 */
export function PhoneHeader({
  breadcrumbs,
  canGoBack,
  canGoForward,
  tabCount,
  showHistoryControls = true,
  onBack,
  onForward,
  onOpenTabs,
  onOpenInspector
}: {
  readonly breadcrumbs: readonly string[];
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  readonly tabCount: number;
  /** False omits Back/Forward for an alternate presentation elsewhere. */
  readonly showHistoryControls?: boolean;
  readonly onBack: () => void;
  readonly onForward: () => void;
  readonly onOpenTabs: () => void;
  readonly onOpenInspector: () => void;
}) {
  const button =
    "flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-small border-0 bg-transparent text-titlebar-foreground tn-focus-ring disabled:cursor-default disabled:opacity-40";
  return (
    // `min-h-14` (not `h-14`) so the safe-area inset is added *on top of* the
    // 56px content area, not carved out of it. With `box-sizing: border-box`
    // a fixed `h-14` includes the padding, so a 24px status-bar inset would
    // squeeze the buttons into 32px.
    <header className="flex min-h-14 shrink-0 items-center justify-between gap-1 border-b border-border bg-titlebar px-1 pt-[env(safe-area-inset-top)] text-titlebar-foreground">
      {showHistoryControls && (
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
          <button
            type="button"
            aria-label="Forward"
            disabled={!canGoForward}
            className={button}
            onClick={onForward}
          >
            <ArrowRight aria-hidden="true" className="size-5" />
          </button>
        </div>
      )}

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
          aria-label="Document tools"
          className={button}
          onClick={onOpenInspector}
        >
          <MoreHorizontal aria-hidden="true" className="size-5" />
        </button>
      </div>
    </header>
  );
}
