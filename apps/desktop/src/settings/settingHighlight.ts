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
  for (const listener of subscribers) listener(key);

  if (clearTimer !== null) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }
  clearTimer = setTimeout(() => {
    currentHighlight = null;
    clearTimer = null;
    for (const listener of subscribers) listener(null);
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
  listener(currentHighlight);
  return () => {
    subscribers.delete(listener);
  };
}
