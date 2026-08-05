/**
 * Theme-specific controls rendered in the Appearance section of the settings UI.
 *
 * These components are only mounted when the active settings section is
 * `appearance.theme`. `ThemePicker` is a dropdown of discovered theme files
 * (loaded from the native themes directory); `ThemeToolbar` provides the
 * Export/Import theme actions. They were extracted from `SettingsContent` to
 * keep that file focused on the generic settings-row rendering and under the
 * 500-line preference.
 */

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Download, Upload } from "lucide-react";
import { cn } from "../lib/utils";
import { useSettingsStore } from "./settingsStore";
import { listThemes, type ThemeEntry } from "./themeAdapter";
import {
  buildThemeExportPayload,
  writeThemeExportFile,
  importTheme,
  type ImportThemeResult
} from "./themeImportExport";
import { computeEffectiveValue } from "./SettingsContent";

/**
 * A dropdown picker for selecting a discovered theme file.
 *
 * Loads the list of `.tbtheme.json` files from the app-data themes directory
 * (via the native `list_themes` command) on mount, and renders a `<select>`
 * whose options are the discovered themes. The select's value tracks the
 * effective `appearance.themeFile` setting; changing it stages the selected
 * path (or `null` for the "None" option) so the ThemeProvider picks it up on
 * the next save.
 *
 * The "None (use base theme)" option is always present and selected when no
 * custom theme file is active. The existing Browse button (PathControl) and
 * Export/Import buttons remain available alongside the picker so users can
 * still load external files not in the themes directory.
 */
export function ThemePicker() {
  // Discovered themes loaded from the native themes directory.
  const [themes, setThemes] = useState<readonly ThemeEntry[]>([]);
  // Load error message shown inline if the native list call fails. Empty string
  // means "no error" (null would also work, but a string keeps the render branch
  // simple and avoids an extra null-check).
  const [loadError, setLoadError] = useState<string | null>(null);

  // Subscribe to the raw value maps so the select re-renders when the user
  // stages a new theme file path (or reverts). Only the three fields the
  // effective-value computation reads are selected, matching SettingRow.
  const stagedChanges = useSettingsStore((s) => s.stagedChanges);
  const appValues = useSettingsStore((s) => s.appValues);
  const workspaceValues = useSettingsStore((s) => s.workspaceValues);
  const stageChange = useSettingsStore((s) => s.stageChange);

  // Load the theme list on mount. The adapter returns an empty array outside
  // Tauri (tests, web preview), so the picker renders with just the "None"
  // option and no error in those contexts.
  useEffect(() => {
    let cancelled = false;
    void listThemes()
      .then((entries) => {
        if (cancelled) return;
        setThemes(entries);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // Fail loudly: surface the error message so the user knows why the
        // picker is empty. The "None" option remains usable.
        const message =
          error instanceof Error ? error.message : "Failed to load themes.";
        setLoadError(message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Compute the effective themeFile value (staged > app > workspace > default).
  // The default is `null` (no custom theme) per the settings registry.
  const themeFileValue = computeEffectiveValue(
    "appearance.themeFile",
    null,
    stagedChanges,
    appValues,
    workspaceValues
  );
  // Normalize to a string for the <select> value. `null` maps to the empty
  // string (the "None" option's value). Non-string values are coerced to "" so
  // the select never has an unmatched value.
  const selectValue =
    typeof themeFileValue === "string" ? themeFileValue : "";

  /**
   * Stages the selected theme file path (or null for "None").
   */
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value;
      // Empty string === "None" option === null themeFile.
      stageChange("appearance.themeFile", value === "" ? null : value);
    },
    [stageChange]
  );

  return (
    <div className="mb-3 flex flex-col gap-1">
      <label
        className="text-sm font-semibold text-foreground"
        htmlFor="theme-picker-select"
      >
        Theme File
      </label>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Choose a discovered theme, or use Browse/Import below to load an external
        file.
      </p>
      <select
        id="theme-picker-select"
        value={selectValue}
        onChange={handleChange}
        className="mt-1 max-w-[24rem] rounded-small border border-border bg-surface px-2 py-1 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">None (use base theme)</option>
        {themes.map((entry) => (
          <option key={entry.path} value={entry.path}>
            {entry.name}
          </option>
        ))}
      </select>
      {loadError !== null && (
        <p role="alert" className="text-xs text-destructive">
          {loadError}
        </p>
      )}
    </div>
  );
}

/**
 * A small toolbar of theme export/import actions shown above the setting rows
 * in the `appearance.theme` section.
 *
 * "Export Theme" snapshots the currently active theme (base palette + computed
 * token values) to a `.tbtheme.json` file via a native save dialog. "Import
 * Theme" opens a `.tbtheme.json` file, parses it, and stages the path in
 * `appearance.themeFile` so the ThemeProvider picks it up. Both actions show a
 * transient status message (cleared after a few seconds), mirroring the
 * SettingsSaveBar pattern.
 *
 * The buttons only render when the active section is `appearance.theme`; they
 * are always enabled (export never needs staged state, and import stages its
 * own result).
 */
export function ThemeToolbar() {
  // Transient status message from export/import (cleared after a few seconds).
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Clears the transient status message (cancels any pending timeout). */
  const clearStatus = useCallback((): void => {
    if (statusTimeoutRef.current !== null) {
      clearTimeout(statusTimeoutRef.current);
      statusTimeoutRef.current = null;
    }
    setStatusMessage(null);
  }, []);

  /**
   * Shows a transient status message for a few seconds, then auto-clears it.
   * Replaces any previously scheduled clear timeout.
   */
  const showStatus = useCallback(
    (message: string): void => {
      clearStatus();
      setStatusMessage(message);
      statusTimeoutRef.current = setTimeout(() => {
        setStatusMessage(null);
        statusTimeoutRef.current = null;
      }, 4000);
    },
    [clearStatus]
  );

  // Clear the timeout on unmount so we don't set state on an unmounted component.
  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current !== null) {
        clearTimeout(statusTimeoutRef.current);
        statusTimeoutRef.current = null;
      }
    };
  }, []);

  /**
   * Builds the theme export payload and writes it via a native save dialog.
   * Shows a status message on success or failure.
   */
  const handleExport = useCallback((): void => {
    const { json } = buildThemeExportPayload();
    void writeThemeExportFile(json).then((written) => {
      if (written) {
        showStatus("Theme exported.");
      }
      // On cancel/failure, no message — the user already saw the dialog dismiss.
    });
  }, [showStatus]);

  /**
   * Opens a native open dialog, reads and parses the theme file, and stages the
   * path. Shows a status message with the theme name or diagnostics.
   */
  const handleImport = useCallback((): void => {
    void importTheme().then((result: ImportThemeResult | null) => {
      // User cancelled the dialog or the file couldn't be read — no message.
      if (result === null) return;

      if (result.themeName !== null) {
        // Successful parse: report the theme name. Diagnostics (warnings) are
        // appended so the user is aware of any dropped tokens.
        const diagCount = result.diagnostics.length;
        const msg =
          diagCount > 0
            ? `Imported theme "${result.themeName}" (${diagCount} warning(s)).`
            : `Imported theme "${result.themeName}".`;
        showStatus(msg);
        return;
      }

      // Parse failed: surface the first error message so the user can fix the
      // file. Full diagnostics are logged by the ThemeProvider when it loads.
      const firstError = result.diagnostics.find((d) => d.severity === "error");
      showStatus(
        firstError
          ? `Import failed: ${firstError.message}`
          : "Import failed: theme file is invalid."
      );
    });
  }, [showStatus]);

  return (
    <div
      className="mb-3 flex items-center gap-[0.3rem]"
      role="toolbar"
      aria-label="Theme actions"
    >
      <button
        type="button"
        onClick={handleExport}
        title="Export Theme"
        aria-label="Export Theme"
        className={cn(
          "flex items-center gap-1 rounded-small px-1.5 py-0.5 text-xs",
          "text-muted-foreground bg-surface cursor-pointer",
          "hover:text-foreground hover:bg-accent transition-colors"
        )}
      >
        <Download className="size-3" aria-hidden="true" />
        <span>Export Theme</span>
      </button>
      <button
        type="button"
        onClick={handleImport}
        title="Import Theme"
        aria-label="Import Theme"
        className={cn(
          "flex items-center gap-1 rounded-small px-1.5 py-0.5 text-xs",
          "text-muted-foreground bg-surface cursor-pointer",
          "hover:text-foreground hover:bg-accent transition-colors"
        )}
      >
        <Upload className="size-3" aria-hidden="true" />
        <span>Import Theme</span>
      </button>
      {statusMessage && (
        <span
          className="ml-2 text-xs text-muted-foreground"
          role="status"
          title={statusMessage}
        >
          {statusMessage}
        </span>
      )}
    </div>
  );
}
