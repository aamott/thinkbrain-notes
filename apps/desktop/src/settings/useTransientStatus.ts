import { useCallback, useEffect, useRef, useState } from "react";

/** Default auto-clear delay for transient status messages (4 seconds). */
const DEFAULT_CLEAR_DELAY_MS = 4000;

/** Return value of {@link useTransientStatus}. */
export interface TransientStatus {
  /** The current status message, or null when no message is showing. */
  readonly message: string | null;
  /** Shows a transient status message that auto-clears after the delay. */
  readonly show: (message: string, delayMs?: number) => void;
  /** Immediately clears the current status message (cancels any pending timeout). */
  readonly clear: () => void;
}

/**
 * A transient status message that auto-clears after a delay.
 *
 * Useful for action feedback (e.g. "Settings saved", "Theme exported") where a
 * permanent message would clutter the UI. The hook manages the timeout and
 * cleans it up on unmount so no stale callback fires after the component is
 * gone.
 *
 * Args:
 *   delayMs: Auto-clear delay in milliseconds (defaults to 4000).
 *
 * Returns:
 *   A {@link TransientStatus} with the current message, a `show` function, and
 *   a `clear` function.
 */
export function useTransientStatus(
  delayMs: number = DEFAULT_CLEAR_DELAY_MS
): TransientStatus {
  const [message, setMessage] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Clears the transient status message (cancels any pending timeout). */
  const clear = useCallback((): void => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setMessage(null);
  }, []);

  /**
   * Shows a transient status message for a few seconds, then auto-clears it.
   * Replaces any previously scheduled clear timeout.
   */
  const show = useCallback(
    (msg: string, customDelayMs?: number): void => {
      clear();
      setMessage(msg);
      const delay = customDelayMs ?? delayMs;
      timeoutRef.current = setTimeout(() => {
        setMessage(null);
        timeoutRef.current = null;
      }, delay);
    },
    [clear, delayMs]
  );

  // Clear the timeout on unmount so we don't set state on an unmounted component.
  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  return { message, show, clear };
}
