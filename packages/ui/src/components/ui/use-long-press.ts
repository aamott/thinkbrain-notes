import { useCallback, useEffect, useMemo, useRef } from "react";

/** Press-and-hold threshold, in milliseconds, before a tap becomes a long press. */
export const LONG_PRESS_MS = 500;

/**
 * Pointer-event long press, shared by the phone's hub and drawer rows.
 *
 * The callback is supplied to `begin` rather than to the hook itself so one
 * instance can serve a list of rendered targets — a nav item or drawer row
 * passes its own `onLongPress` at pointer-down time. Release, slide-off and
 * cancel all end a pending hold; a hold that fires sets a flag the trailing
 * `click` (or a `contextmenu` fallback) must check so the press is not
 * handled twice.
 */
export interface LongPress {
  /**
   * Arms a hold for `onLongPress`. `undefined` leaves the element a plain
   * button: no timer is armed and a tap of any length stays a tap.
   */
  readonly begin: (onLongPress: (() => void) | undefined) => void;
  /** Ends a pending hold without firing — release, slide-off, move, cancel. */
  readonly cancel: () => void;
  /** Whether a hold has already fired; read-only, for `contextmenu` fallbacks. */
  readonly hasFired: () => boolean;
  /**
   * Whether the upcoming click belongs to a completed long press. Consumes
   * the flag — a completed long press already acted, so its click must be
   * swallowed exactly once and never the next real tap.
   */
  readonly consumeClick: () => boolean;
}

export function useLongPress(): LongPress {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  // A pending hold that outlives the component would call back into an
  // unmounted tree, so the timer dies with it.
  useEffect(() => () => cancel(), [cancel]);

  const begin = useCallback(
    (onLongPress: (() => void) | undefined) => {
      // Reset unconditionally, and before the fired flag is read: a hold that
      // completed but never produced a click — the finger slid off the
      // element — would otherwise leave the flag set and swallow the next tap.
      firedRef.current = false;
      cancel();
      if (!onLongPress) return;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        firedRef.current = true;
        onLongPress();
      }, LONG_PRESS_MS);
    },
    [cancel]
  );

  const hasFired = useCallback(() => firedRef.current, []);

  const consumeClick = useCallback(() => {
    const fired = firedRef.current;
    firedRef.current = false;
    return fired;
  }, []);

  return useMemo(
    () => ({ begin, cancel, hasFired, consumeClick }),
    [begin, cancel, hasFired, consumeClick]
  );
}
