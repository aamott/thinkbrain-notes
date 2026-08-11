/**
 * Sticky save/reset bar at the bottom of the settings content area.
 *
 * Per epic design decision #4 (single Save button), all staged changes are
 * persisted in one write via `saveSettings()`. The Reset button reverts staged
 * changes to the last-saved values via `resetStaged()`. Both buttons are
 * disabled when there are no staged changes (`isDirty === false`).
 *
 * Per epic design decision #6, Export and Import buttons live on the LEFT side
 * of the bar as small icon buttons (keeping the bar clean). Export writes all
 * app-scoped settings to a JSON file via a Tauri save dialog, with a portable
 * warning when non-portable settings have non-default values. Import reads a
 * JSON file, validates against the registry, and stages the values for review.
 *
 * The bar is sticky (`sticky bottom-0`) so it remains visible while the content
 * area scrolls. It belongs to the right content pane (see {@link SettingsTab}),
 * not the left nav. When `saveError` is set, a small error message is shown in
 * the bar using the `text-destructive` token.
 */

import { useCallback } from "react";
import { Download, Upload } from "lucide-react";
import { cn } from "../lib/utils";
import { useSettingsStore } from "./settingsStore";
import {
  buildExportPayload,
  writeExportFile,
  importSettings,
  type ImportResult
} from "./settingsImportExport";
import { useTransientStatus } from "./useTransientStatus";

/**
 * The settings save/reset bar with export/import actions.
 *
 * Reads `isDirty`, `dirtyCount`, and `saveError` from the settings store. Save
 * and Reset are dispatched via `useSettingsStore.getState()` one-shot reads so
 * the bar doesn't re-render on unrelated store slices.
 */
export function SettingsSaveBar() {
  const isDirty = useSettingsStore((s) => s.isDirty);
  const dirtyCount = useSettingsStore((s) => s.dirtyCount);
  const saveError = useSettingsStore((s) => s.saveError);
  // Effective autosave flag: staged > appValues > default. When true, the
  // Save/Reset buttons are hidden and an "Autosave enabled" label is shown
  // instead (changes persist via the store's debounced autosave path).
  const autosave = useSettingsStore((s) =>
    s.stagedChanges["settings.autosave"] ?? s.appValues["settings.autosave"] ?? false
  );

  // Transient status message from import/export actions (cleared after a few
  // seconds). Rendered inline in the bar so the user gets immediate feedback.
  const status = useTransientStatus();

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

  /**
   * Builds the export payload, shows a portable warning if needed, and writes
   * the JSON file via a native save dialog.
   */
  const handleExport = useCallback((): void => {
    const { json, portableWarnings } = buildExportPayload();

    if (portableWarnings.length > 0) {
      // NOTE: window.confirm is used here intentionally for simplicity. The
      // rest of the app uses the native dialog bridge (DirtyCloseDialog), and
      // replacing this with a styled modal for consistency is a tracked
      // follow-up rather than a correctness issue.
      const proceed = window.confirm(
        `${portableWarnings.length} setting(s) may not work on another machine. Export anyway?`
      );
      if (!proceed) return;
    }

    void writeExportFile(json)
      .then((written) => {
        if (written) {
          status.show("Settings exported.");
        }
        // false = the user dismissed the dialog, which needs no comment.
      })
      .catch(() => {
        status.show("Export failed: could not write file.");
      });
  }, [status]);

  /**
   * Opens a native open dialog, reads the JSON file, validates and stages the
   * values, and shows a status message with the import counts.
   */
  const handleImport = useCallback((): void => {
    void importSettings()
      .then((result: ImportResult | null) => {
        if (result === null) return; // The user dismissed the dialog.

        const parts: string[] = [`Imported ${result.imported} setting(s)`];
        if (result.ignored > 0) {
          parts.push(`ignored ${result.ignored} unknown key(s)`);
        }
        if (result.typeMismatches > 0) {
          parts.push(`${result.typeMismatches} type mismatch(es)`);
        }
        status.show(parts.join(", ") + ".");
      })
      .catch(() => {
        status.show("Import failed: the file could not be read.");
      });
  }, [status]);

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
      {/* Export / Import on the left side (small icon buttons). */}
      <div className="flex items-center gap-[0.3rem]">
        <button
          type="button"
          onClick={handleExport}
          title="Export settings"
          aria-label="Export settings"
          className={cn(
            "flex items-center justify-center rounded-small p-[0.35rem]",
            "text-muted-foreground bg-surface cursor-pointer",
            "hover:text-foreground hover:bg-accent transition-colors"
          )}
        >
          <Download className="size-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={handleImport}
          title="Import settings"
          aria-label="Import settings"
          className={cn(
            "flex items-center justify-center rounded-small p-[0.35rem]",
            "text-muted-foreground bg-surface cursor-pointer",
            "hover:text-foreground hover:bg-accent transition-colors"
          )}
        >
          <Upload className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* Transient status message from import/export. */}
      {status.message && (
        <span
          className="ml-2 text-xs text-muted-foreground"
          role="status"
          title={status.message}
        >
          {status.message}
        </span>
      )}

      {/* Error message (pushes everything else to the right via mr-auto). */}
      {saveError && (
        <span
          role="alert"
          className="mr-auto text-xs text-destructive"
          title={saveError}
        >
          {saveError}
        </span>
      )}

      {/* Spacer pushes Save/Reset to the right when no error is shown. */}
      {!saveError && <span className="mr-auto" />}

      {autosave ? (
        // Autosave mode: hide Save/Reset and show an unobtrusive label. The
        // store's debounced autosave path persists changes; the Save/Reset
        // flow is unnecessary (and Reset would fight the autosave debounce).
        <span
          className="text-xs text-muted-foreground"
          title="Changes are saved automatically."
        >
          Autosave enabled
        </span>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
