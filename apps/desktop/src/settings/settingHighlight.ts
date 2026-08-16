/**
 * Lightweight module-scoped highlight bus for setting rows.
 *
 * After a search-result click, the nav calls `requestSettingHighlight` with the
 * full setting key. `SettingsContent` subscribes and applies a temporary
 * highlight class to the matching row. This avoids polluting the Zustand store
 * API (per the story constraints) while still communicating across components.
 *
 * The highlight auto-clears after a short timeout (~1200ms) so the visual
 * emphasis is brief. Any prior pending timeout is cancelled to avoid flicker
 * when multiple highlights are requested in quick succession.
 *
 * Robustness guarantees (see plans/maintenance/done-settings_highlight_bus-low-med.md):
 * - A throwing subscriber is logged via `console.error` and skipped; sibling
 *   subscribers still receive both the highlight and the clear notification.
 * - A Vite HMR `dispose` handler clears subscribers, the pending timeout, and
 *   the current highlight so hot-reloading this module never strands stale
 *   state or orphaned timers across remounts.
 */

/** Listener type: receives the key to highlight, or null to clear. */
type HighlightListener = (key: string | null) => void;

/** The currently highlighted key (null = none). */
let currentHighlight: string | null = null;

/** Subscribers notified on highlight changes. */
const subscribers = new Set<HighlightListener>();

/** Pending clear-timeout handle, so we can cancel a prior one. */
let clearTimer: ReturnType<typeof setTimeout> | null = null;

/** How long the highlight stays visible before auto-clearing. */
const HIGHLIGHT_DURATION_MS = 1200;

/**
 * Notifies every subscriber of `key`, isolating failures.
 *
 * A subscriber that throws is logged via `console.error` and skipped so the
 * remaining subscribers still receive the notification. Returns nothing.
 */
function notifySubscribers(key: string | null): void {
  // Snapshot the set before iterating: a listener that subscribes or
  // unsubscribes during notification would otherwise mutate the live Set
  // mid-iteration, skipping or double-notifying subscribers.
  for (const listener of [...subscribers]) {
    try {
      listener(key);
    } catch (error) {
      // Fail loudly but don't strand sibling notifications.
      console.error(
        "[settingHighlight] subscriber threw during notification",
        error
      );
    }
  }
}

/**
 * Requests a highlight on the setting row matching `key`.
 *
 * Notifies subscribers immediately with the key, then schedules a `null`
 * notification after {@link HIGHLIGHT_DURATION_MS} to clear the highlight. Any
 * previously scheduled clear is cancelled first to avoid premature clearing
 * when highlights overlap.
 *
 * Args:
 *   key: The full setting key (e.g. "editor.fontSize") to highlight.
 */
export function requestSettingHighlight(key: string): void {
  currentHighlight = key;
  notifySubscribers(key);

  if (clearTimer !== null) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }
  clearTimer = setTimeout(() => {
    currentHighlight = null;
    clearTimer = null;
    notifySubscribers(null);
  }, HIGHLIGHT_DURATION_MS);
}

/**
 * Subscribes to highlight changes.
 *
 * The listener is immediately called with the current highlight value so a
 * late subscriber reflects the existing state. Returns an unsubscribe function.
 *
 * Args:
 *   listener: Called with the highlighted key (or null when cleared).
 *
 * Returns:
 *   A function that removes the listener from the subscriber set.
 */
export function subscribeSettingHighlight(
  listener: HighlightListener
): () => void {
  subscribers.add(listener);
  // Replay the current state to the late subscriber. Wrapped so a subscriber
  // that throws during replay doesn't strand the bus or prevent the caller
  // from receiving its unsubscribe function.
  try {
    listener(currentHighlight);
  } catch (error) {
    console.error(
      "[settingHighlight] subscriber threw during initial replay",
      error
    );
  }
  return () => {
    subscribers.delete(listener);
  };
}

// Vite HMR disposal: when this module is hot-reloaded, drop every subscriber,
// cancel any pending clear timer, and reset the current highlight so the
// freshly evaluated module starts clean. Without this, a remount can leave the
// old subscriber set and timer referencing the disposed module's state.
//
// Note: HMR disposal is registered at module load. The Vitest environment does
// not expose `import.meta.hot`, so it is not exercised by the unit tests below;
// the dispose path is verified manually via the dev-mode reload check in the
// story's "Manual checks" section.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (clearTimer !== null) {
      clearTimeout(clearTimer);
      clearTimer = null;
    }
    subscribers.clear();
    currentHighlight = null;
  });
}
