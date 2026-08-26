import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "../../lib/utils";

/** One hub slot. Resolution from panels and commands happens outside this component. */
export interface BottomNavItem {
  readonly key: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly active?: boolean;
  readonly badge?: number;
  readonly onSelect: () => void;
  readonly onLongPress?: () => void;
}

/** Press-and-hold threshold, in milliseconds, before a tap becomes a long press. */
const LONG_PRESS_MS = 500;

/**
 * Bottom navigation hub.
 *
 * Labels are visible text, not `aria-label` alone: the icon rail this replaces
 * relied on hover to teach its glyphs, and a phone has no hover.
 */
export function BottomNav({
  items,
  label,
  className
}: {
  readonly items: readonly BottomNavItem[];
  readonly label: string;
  readonly className?: string;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);

  const clear = (): void => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  // A pending hold that outlives the component would call back into an
  // unmounted tree, so the timer dies with the nav.
  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = null;
    },
    []
  );

  return (
    <nav
      aria-label={label}
      className={cn(
        "flex shrink-0 items-stretch justify-around border-t border-border bg-statusbar text-statusbar-foreground pb-[env(safe-area-inset-bottom)]",
        className
      )}
    >
      {items.map((entry) => (
        <button
          key={entry.key}
          type="button"
          aria-label={entry.label}
          aria-current={entry.active ? "page" : undefined}
          className={cn(
            // Contrast comes from opacity against `text-statusbar-foreground`,
            // not from a second colour. In the light theme
            // `--tn-color-activitybar-active` is the very same purple as
            // `--tn-color-statusbar`, so an active item coloured that way would
            // be invisible on its own bar — and `text-muted-foreground` is grey
            // on that purple. Dark theme hides both faults, which is how they
            // would have shipped. 56px already clears the touch minimum, so no
            // `pointer-coarse:` bump is needed.
            "relative flex min-h-14 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 border-0 bg-transparent px-1 text-[0.65rem] font-medium opacity-70 focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring",
            entry.active && "opacity-100"
          )}
          onPointerDown={() => {
            // Reset unconditionally, and before the long-press guard: a hold
            // that completed but never produced a click — the finger slid off
            // the button — would otherwise leave the flag set and swallow the
            // next tap, on any item, including ones with no long press at all.
            firedRef.current = false;
            clear();
            const longPress = entry.onLongPress;
            if (!longPress) return;
            timerRef.current = setTimeout(() => {
              timerRef.current = null;
              firedRef.current = true;
              longPress();
            }, LONG_PRESS_MS);
          }}
          onPointerUp={clear}
          onPointerLeave={clear}
          onPointerCancel={clear}
          onClick={() => {
            // A completed long press already acted; don't also run the tap.
            if (firedRef.current) {
              firedRef.current = false;
              return;
            }
            entry.onSelect();
          }}
        >
          <span aria-hidden="true" className="flex items-center justify-center">
            {entry.icon}
          </span>
          <span className="truncate">{entry.label}</span>
          {entry.badge !== undefined && entry.badge > 0 && (
            <span className="absolute top-1.5 right-[22%] rounded-full bg-danger px-1.5 text-[0.6rem] font-bold text-danger-foreground">
              {entry.badge}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}
