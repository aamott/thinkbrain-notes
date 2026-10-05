import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { failureMessage } from "./syncCopy";

/**
 * Where a side-by-side comparison stands while it is being read.
 *
 * Both comparison tabs — the conflict merge and the version diff — fetch two
 * versions of one file and land in the same three states: still reading, a
 * comparison ready to draw (whatever shape that comparison takes), or a
 * failure with a message approved for the surface.
 */
export type ComparisonPhase<T> =
  | { readonly at: "loading" }
  | { readonly at: "ready"; readonly result: T }
  | { readonly at: "failed"; readonly message: string };

/**
 * Runs one comparison read and owns its phase.
 *
 * `read` receives `openedWith`: the buffer the comparison was opened with.
 * It is taken once, when the comparison is opened — the editor's text changes
 * with every keystroke, and re-reading on each one would throw away a result
 * already being looked at (and, on the merge tab, already edited). "Current"
 * means what was on screen when the user came to compare, not a moving target.
 *
 * `read` must be stable across renders (a `useCallback` keyed by whatever the
 * read needs): a new identity re-asks the question, exactly as changing the
 * read's own inputs would have.
 */
export function useComparisonPhase<T>(
  read: (openedWith: string | null | undefined) => Promise<T>,
  buffer: string | null | undefined,
  failureFallback: string
): {
  readonly phase: ComparisonPhase<T>;
  readonly setPhase: Dispatch<SetStateAction<ComparisonPhase<T>>>;
} {
  const [phase, setPhase] = useState<ComparisonPhase<T>>({ at: "loading" });
  const openedWith = useRef(buffer);

  useEffect(() => {
    let cancelled = false;
    void read(openedWith.current)
      .then((result) => {
        if (!cancelled) setPhase({ at: "ready", result });
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setPhase({ at: "failed", message: failureMessage(cause, failureFallback) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [read, failureFallback]);

  return { phase, setPhase };
}
