import type { ReactNode } from "react";

import { cn } from "../../lib/utils";
import { CountBadge } from "./count-badge";

/** One floating bubble. Resolution from routes and registries happens outside this component. */
export interface FloatingBubbleItem {
  readonly key: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly onSelect: () => void;
  /** "primary" renders the accent colour (e.g. New note); "default" is the neutral surface. */
  readonly variant?: "default" | "primary";
  /** Lit while the surface it opens is showing — also drives `aria-expanded` for popups. */
  readonly active?: boolean;
  readonly badge?: number;
  /** Noun the badge counts ("conflicts", "notifications") for the accessible
   *  name `${label}, ${badge} ${badgeLabel ?? "new items"}`; the chip is
   *  aria-hidden. */
  readonly badgeLabel?: string;
  /** Marks the bubble as a menu trigger (`aria-haspopup`/`aria-expanded`). */
  readonly hasPopup?: boolean;
}

/**
 * Floating action bubbles for the phone chrome.
 *
 * Two groups hover over the bottom of the content: the left group for
 * navigation (Home, New note), the right group for the action-items trigger.
 * Only the bubbles themselves take pointer events — the strips between and
 * around them are transparent to touches so the content underneath stays
 * scrollable and tappable.
 *
 * Unlike the bottom hub they replace, labels are `aria-label` first and
 * visible text only when `showLabels` is set (the `ui.mobileBubbleLabels`
 * setting) — a pill is wider than a circle, and icons alone are the default.
 */
export function FloatingBubbles({
  label,
  left,
  right,
  showLabels,
  className
}: {
  /** Accessible name for the group as a whole. */
  readonly label: string;
  readonly left: readonly FloatingBubbleItem[];
  readonly right: readonly FloatingBubbleItem[];
  readonly showLabels: boolean;
  readonly className?: string;
}) {
  const group = (items: readonly FloatingBubbleItem[]) => (
    // The gap strips must not swallow taps: pointer events live on each
    // button, never on the group, or the space between bubbles would eat
    // taps aimed at the content under it.
    <div className="flex gap-2">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          // Stable per-bubble hook for tests and e2e — the accessible name
          // changes once a badge lands, so it cannot double as the selector.
          data-bubble={item.key}
          aria-label={
            item.badge !== undefined && item.badge > 0
              ? `${item.label}, ${item.badge} ${item.badgeLabel ?? "new items"}`
              : item.label
          }
          aria-haspopup={item.hasPopup === true ? "menu" : undefined}
          aria-expanded={item.hasPopup === true ? (item.active ?? false) : undefined}
          className={cn(
            // 48px clears the touch minimum. The circle is the resting shape;
            // with labels on, it grows into a pill carrying icon + text.
            "pointer-events-auto relative flex cursor-pointer items-center justify-center gap-2 border border-border shadow-panel tn-focus-ring",
            showLabels ? "h-12 rounded-full px-4 text-sm font-medium" : "size-12 rounded-full",
            item.variant === "primary"
              ? "bg-primary text-primary-foreground"
              : "bg-hub text-hub-foreground",
            // The accent tint would vanish on the primary fill, so an open
            // primary bubble signals with a ring instead.
            item.active === true &&
              (item.variant === "primary" ? "ring-2 ring-ring ring-offset-2" : "text-activitybar-active")
          )}
          onClick={item.onSelect}
        >
          <span aria-hidden="true" className="flex items-center justify-center">
            {item.icon}
          </span>
          {showLabels && <span className="truncate">{item.label}</span>}
          {item.badge !== undefined && item.badge > 0 && (
            <CountBadge count={item.badge} className="absolute -top-1 -right-1" />
          )}
        </button>
      ))}
    </div>
  );

  return (
    // `justify-between` keeps the right group pinned right even when the left
    // group is empty — an absent Home/New note must not drag ⋮ leftward.
    <div
      // `group`, not `toolbar`: a toolbar promises roving-focus keyboard
      // handling between its buttons, which these bubbles do not implement.
      role="group"
      aria-label={label}
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-between gap-2 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]",
        className
      )}
    >
      {group(left)}
      {group(right)}
    </div>
  );
}
