/**
 * A trailing debounce.
 *
 * Several call sites in the app hand-roll one of these (`SearchPanel`, the
 * settings autosave scheduler, the tab model). This is the shared form, added
 * when the file watcher needed a fourth: outside edits arrive one note at a
 * time, and the work each one asks for is the same whole-folder listing.
 */

/** A scheduled call, with a way to drop one that has not run yet. */
export interface Debounced {
  (): void;
  /** Drops a pending run. Safe to call when none is pending. */
  cancel: () => void;
}

/**
 * Returns a function that runs `run` once `delayMs` has passed without another
 * call. Each call restarts the wait, so a burst produces a single run.
 */
export function createDebounced(run: () => void, delayMs: number): Debounced {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancel = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  };

  const schedule: Debounced = Object.assign(
    () => {
      cancel();
      timer = setTimeout(() => {
        timer = null;
        run();
      }, delayMs);
    },
    { cancel }
  );

  return schedule;
}
