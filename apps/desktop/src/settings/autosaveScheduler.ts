/**
 * Debounced autosave scheduler for the settings store.
 *
 * Extracted from `settingsStore.ts` to keep that file under the 500-line
 * guideline. The scheduler holds a single module-level timer (shared across
 * store instances, which is fine since there is only one production store) and
 * coalesces rapid `stageChange` edits into a single `saveSettings()` call after
 * a short debounce window.
 */

/** Debounce window (ms) for autosave. Keeps rapid edits from spamming writes. */
const AUTOSAVE_DELAY_MS = 300;

/** Handle for the pending autosave timer, or null when none is scheduled. */
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Schedules a debounced `saveSettings` call.
 *
 * Each call resets the pending timer so only the most recent edit within the
 * debounce window triggers a save. The `saveSettings` provider is invoked
 * asynchronously; failures are logged (fail-loudly) but do not throw out of the
 * timer callback.
 *
 * Args:
 *   saveSettings: A function returning the save promise (typically
 *     `() => get().saveSettings()`).
 */
export function scheduleAutosave(saveSettings: () => Promise<unknown>): void {
  if (autosaveTimer !== null) {
    clearTimeout(autosaveTimer);
  }
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;
    void saveSettings().catch((error: unknown) => {
      console.error("[settingsStore] Autosave failed:", error);
    });
  }, AUTOSAVE_DELAY_MS);
}

/**
 * Clears any pending autosave timer.
 *
 * Intended for tests that need to reset the module-level timer between cases.
 */
export function clearAutosaveTimer(): void {
  if (autosaveTimer !== null) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }
}
