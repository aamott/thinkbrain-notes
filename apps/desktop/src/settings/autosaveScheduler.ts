/**
 * Debounced autosave for the settings store.
 *
 * Extracted from `settingsStore.ts` to keep that file under the 500-line
 * guideline. One module-level debounce, shared across store instances — fine,
 * since there is only one production store — coalescing rapid `stageChange`
 * edits into a single `saveSettings()` call.
 */

import { createDebounced } from "../lib/debounce";

/** Debounce window (ms) for autosave. Keeps rapid edits from spamming writes. */
const AUTOSAVE_DELAY_MS = 300;

/**
 * Schedules a debounced `saveSettings` call.
 *
 * Each call restarts the wait and replaces the pending save, so only the most
 * recent edit in a burst writes. Failures are logged rather than thrown: by the
 * time the timer runs, nothing is waiting to catch them.
 *
 * Args:
 *   saveSettings: A function returning the save promise (typically
 *     `() => get().saveSettings()`).
 */
export const scheduleAutosave = createDebounced<() => Promise<unknown>>(
  (saveSettings) => {
    void saveSettings().catch((error: unknown) => {
      console.error("[settingsStore] Autosave failed:", error);
    });
  },
  AUTOSAVE_DELAY_MS
);
