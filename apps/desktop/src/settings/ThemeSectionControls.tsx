/**
 * Theme-specific controls rendered in the Appearance section of the settings UI.
 *
 * These components are only mounted when the active settings section is
 * `appearance.theme`. `ThemePicker` is a unified dropdown that combines the
 * base theme options (System/Light/Dark) with the discovered `.tbtheme.json`
 * preset files; `ThemeToolbar` provides the Export/Import theme actions. They
 * were extracted from `SettingsContent` to keep that file focused on the
 * generic settings-row rendering and under the 500-line preference.
 */

import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { Download, Upload } from "lucide-react";
import { cn } from "../lib/utils";
import { appSettingsRegistry, useSettingsStore } from "./settingsStore";
import { resolveEffectiveValue } from "./settingsHelpers";
import { listThemes, type ThemeEntry } from "./themeAdapter";
import {
  buildThemeExport,
  writeThemeExportFile,
  importTheme,
  type ImportThemeResult
} from "./themeImportExport";
import { useTransientStatus } from "./useTransientStatus";

/**
 * The base theme option values exposed by the unified picker.
 *
 * These map directly to the `appearance.theme` enum (`system`/`light`/`dark`).
 * Selecting one clears `appearance.themeFile` so the base palette takes effect.
 */
const BASE_THEME_OPTIONS = ["system", "light", "dark"] as const;
type BaseThemeOption = (typeof BASE_THEME_OPTIONS)[number];

/**
 * Type guard narrowing a string to a {@link BaseThemeOption}.
 *
 * Used by `handleChange` to distinguish the base options (which stage
 * `appearance.theme` and clear `themeFile`) from a theme-file path (which
 * stages `appearance.themeFile` and leaves `theme` untouched).
 */
function isBaseThemeOption(value: string): value is BaseThemeOption {
  return (BASE_THEME_OPTIONS as readonly string[]).includes(value);
}

/**
 * A unified dropdown picker for selecting the application theme.
 *
 * Combines the base theme options (System/Light/Dark) with the list of
 * discovered `.tbtheme.json` preset files (loaded from the native themes
 * directory via the `list_themes` command) into a single `<select>` with two
 * `<optgroup>` sections: "Base" and "Themes".
 *
 * The select's value is determined by:
 *   - If `appearance.themeFile` is set to a non-null string → that path.
 *   - Otherwise → the effective `appearance.theme` value
 *     ("system"/"light"/"dark").
 *
 * Selecting a base option stages `appearance.theme` to that value AND stages
 * `appearance.themeFile` to `null` (clearing any active preset). Selecting a
 * theme file stages `appearance.themeFile` to the path; `appearance.theme` is
 * left untouched since the file's `base` field drives the actual palette while
 * a file is active.
 *
 * The Export/Import buttons in {@link ThemeToolbar} remain available alongside
 * the picker so users can still load external files not in the themes
 * directory.
 */
export function ThemePicker() {
  // Discovered themes loaded from the native themes directory.
  const [themes, setThemes] = useState<readonly ThemeEntry[]>([]);
  // Load error message shown inline if the native list call fails. null means
  // "no error" — kept as null (rather than an empty string) so the render
  // branch is a single null-check.
  const [loadError, setLoadError] = useState<string | null>(null);

  // Subscribe to the raw value maps so the select re-renders when the user
  // stages a new theme (or theme file path). Only the three fields the
  // effective-value computation reads are selected, matching SettingRow.
  const stagedChanges = useSettingsStore((s) => s.stagedChanges);
  const appValues = useSettingsStore((s) => s.appValues);
  const workspaceValues = useSettingsStore((s) => s.workspaceValues);
  const stageChange = useSettingsStore((s) => s.stageChange);

  // Load the theme list on mount. The adapter returns an empty array outside
  // Tauri (tests, web preview), so the picker renders with just the base
  // options and no error in those contexts.
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
        // Themes group is empty. The base options remain usable.
        const message =
          error instanceof Error ? error.message : "Failed to load themes.";
        setLoadError(message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Compute the effective themeFile value (staged > app > default). The
  // default is `null` (no custom theme) per the settings registry. Both
  // appearance.theme and appearance.themeFile are app-scoped, so a workspace
  // file cannot override them — resolveEffectiveValue enforces that.
  const themeFileDef = appSettingsRegistry.getDefinition("appearance.themeFile");
  const themeFileValue = resolveEffectiveValue(
    "appearance.themeFile",
    stagedChanges,
    appValues,
    workspaceValues,
    themeFileDef
  );

  // The unified select's value: if a theme file is active (non-null string),
  // use its path; otherwise fall back to the effective base `appearance.theme`
  // value (defaulting to "system" if somehow not a string).
  const themeDef = appSettingsRegistry.getDefinition("appearance.theme");
  const themeValue = resolveEffectiveValue(
    "appearance.theme",
    stagedChanges,
    appValues,
    workspaceValues,
    themeDef
  );
  const selectValue =
    typeof themeFileValue === "string" && themeFileValue !== ""
      ? themeFileValue
      : typeof themeValue === "string" && isBaseThemeOption(themeValue)
        ? themeValue
        : "system";

  /**
   * Stages the selected option.
   *
   * Base options ("system"/"light"/"dark") stage `appearance.theme` and clear
   * `appearance.themeFile` to `null`. A theme-file path stages
   * `appearance.themeFile` and leaves `appearance.theme` untouched (the file's
   * `base` field drives the palette while a file is active).
   */
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value;
      if (isBaseThemeOption(value)) {
        stageChange("appearance.theme", value);
        stageChange("appearance.themeFile", null);
      } else {
        // A theme-file path. Don't touch `appearance.theme` — it stays as
        // whatever it was, and the ThemeProvider uses the file's `base` field
        // while a file is active.
        stageChange("appearance.themeFile", value);
      }
    },
    [stageChange]
  );

  return (
    <div className="mb-3 flex flex-col gap-1">
      <label
        className="text-sm font-semibold text-foreground"
        htmlFor="theme-picker-select"
      >
        Theme
      </label>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Choose a base theme or a preset. Custom .tbtheme.json files can be
        imported below.
      </p>
      <select
        id="theme-picker-select"
        value={selectValue}
        onChange={handleChange}
        className="mt-1 max-w-sm rounded-small border border-border bg-surface px-2 py-1 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <optgroup label="Base">
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </optgroup>
        <optgroup label="Themes">
          {themes.map((entry) => (
            <option key={entry.path} value={entry.path}>
              {entry.name}
            </option>
          ))}
        </optgroup>
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
  const status = useTransientStatus();

  /**
   * Builds the theme export payload and writes it via a native save dialog.
   * Shows a status message on success or failure.
   */
  const handleExport = useCallback((): void => {
    void buildThemeExport()
      .then(({ json }) => writeThemeExportFile(json))
      .then((written) => {
        if (written) {
          status.show("Theme exported.");
        }
        // false = cancelled, no message (user dismissed the dialog)
      })
      .catch(() => {
        // Write failure (disk full, permission denied) — fail loudly.
        status.show("Export failed: could not write file.");
      });
  }, [status]);

  /**
   * Opens a native open dialog, reads and parses the theme file, and stages the
   * path. Shows a status message with the theme name or diagnostics.
   */
  const handleImport = useCallback((): void => {
    void importTheme()
      .then((result: ImportThemeResult | null) => {
        // User cancelled the dialog — no message.
        if (result === null) return;

        if (result.themeName !== null) {
          // Successful parse: report the theme name. Diagnostics (warnings) are
          // appended so the user is aware of any dropped tokens.
          const diagCount = result.diagnostics.length;
          const msg =
            diagCount > 0
              ? `Imported theme "${result.themeName}" (${diagCount} warning(s)).`
              : `Imported theme "${result.themeName}".`;
          status.show(msg);
          return;
        }

        // Parse failed: surface the first error message so the user can fix the
        // file. Full diagnostics are logged by the ThemeProvider when it loads.
        const firstError = result.diagnostics.find((d) => d.severity === "error");
        status.show(
          firstError
            ? `Import failed: ${firstError.message}`
            : "Import failed: theme file is invalid."
        );
      })
      .catch(() => {
        // Read failure (file missing, permission denied) — fail loudly.
        status.show("Import failed: could not read file.");
      });
  }, [status]);

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
      {status.message && (
        <span
          className="ml-2 text-xs text-muted-foreground"
          role="status"
          title={status.message}
        >
          {status.message}
        </span>
      )}
    </div>
  );
}
