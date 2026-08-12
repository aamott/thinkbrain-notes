/**
 * A trailing debounce.
 *
 * Several places in the app coalesce a burst of work into one run: a drag
 * writing the panel width it settled on, a run of tab opens writing the tab
 * list once, rapid settings edits saving once, the file watcher listing the
 * folder once for a whole `git checkout`. Each had hand-rolled the same timer.
 *
 * Most of them carry a value — the width, the tabs — so a call replaces both
 * the pending run and what it will run with. `createDebounced<void>` (the
 * default) is the plain form, callable with no arguments.
 */

/** No argument for the plain form, one for a debounce that carries a value. */
type DebouncedArgs<T> = [T] extends [void] ? [] : [value: T];

/** A scheduled call, with a way to drop one that has not run yet. */
export interface Debounced<T = void> {
  (...args: DebouncedArgs<T>): void;
  /** Drops a pending run and the value it was going to use. */
  cancel: () => void;
}

/**
 * Returns a function that runs `run` once `delayMs` has passed without another
 * call. Each call restarts the wait and replaces the pending value, so a burst
 * produces a single run describing where the burst ended up.
 */
export function createDebounced<T = void>(
  run: (value: T) => void,
  delayMs: number
): Debounced<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: T;

  const cancel = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  };

  const schedule = (...args: DebouncedArgs<T>) => {
    // `args` is empty for the plain form, where `pending` stays undefined and
    // `run` ignores it.
    pending = args[0] as T;
    cancel();
    timer = setTimeout(() => {
      timer = null;
      run(pending);
    }, delayMs);
  };

  return Object.assign(schedule, { cancel });
}
