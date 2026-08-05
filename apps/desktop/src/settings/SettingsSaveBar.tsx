/**
 * Sticky save/reset bar at the bottom of the settings content area.
 *
 * Per epic design decision #4 (single Save button), all staged changes are
 * persisted in one write via `saveSettings()`. The Reset button reverts staged
 * changes to the last-saved values via `resetStaged()`. Both buttons are
 * disabled when there are no staged changes (`isDirty === false`).
 *
 * The bar is sticky (`sticky bottom-0`) so it remains visible while the content
 * area scrolls. It belongs to the right content pane (see {@link SettingsTab}),
 * not the left nav. When `saveError` is set, a small error message is shown in
 * the bar using the `text-destructive` token.
 */

import { cn } from "../lib/utils";
import { useSettingsStore } from "./settingsStore";

/**
 * The settings save/reset bar.
 *
 * Reads `isDirty`, `dirtyCount`, and `saveError` from the settings store. Save
 * and Reset are dispatched via `useSettingsStore.getState()` one-shot reads so
 * the bar doesn't re-render on unrelated store slices.
 */
export function SettingsSaveBar() {
  const isDirty = useSettingsStore((s) => s.isDirty);
  const dirtyCount = useSettingsStore((s) => s.dirtyCount);
  const saveError = useSettingsStore((s) => s.saveError);

  /**
   * Persists all staged changes. On success the store clears staged changes and
   * the bar updates reactively. On validation failure the store sets
   * `validationDiagnostics` which {@link SettingsContent} displays inline.
   */
  const handleSave = (): void => {
    void useSettingsStore.getState().saveSettings();
  };

  /** Reverts all staged changes to the last-saved values. */
  const handleReset = (): void => {
    useSettingsStore.getState().resetStaged();
  };

  const saveLabel = dirtyCount > 0 ? `Save (${dirtyCount})` : "Save";

  return (
    <div
      className={cn(
        "sticky bottom-0 z-10 flex items-center justify-end gap-[0.45rem]",
        "border-t border-border bg-surface px-4 py-[0.5rem]"
      )}
      role="toolbar"
      aria-label="Settings actions"
    >
      {saveError && (
        <span
          role="alert"
          className="mr-auto text-xs text-destructive"
          title={saveError}
        >
          {saveError}
        </span>
      )}
      <button
        type="button"
        disabled={!isDirty}
        onClick={handleReset}
        className={cn(
          "border border-border rounded-small py-[0.4rem] px-[0.6rem] text-xs font-inherit",
          "text-foreground bg-surface cursor-pointer",
          !isDirty && "cursor-not-allowed opacity-50"
        )}
      >
        Reset
      </button>
      <button
        type="button"
        disabled={!isDirty}
        onClick={handleSave}
        className={cn(
          "border border-border rounded-small py-[0.4rem] px-[0.6rem] text-xs font-inherit",
          "text-primary-foreground bg-primary cursor-pointer",
          !isDirty && "cursor-not-allowed opacity-50"
        )}
      >
        {saveLabel}
      </button>
    </div>
  );
}
