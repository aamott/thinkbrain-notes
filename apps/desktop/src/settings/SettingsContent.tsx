/**
 * Settings content area: renders the controls for the active section.
 *
 * For each setting definition in the active section, renders a row with the
 * label, description, and the auto-generated (or custom) control. The
 * control's value is the *effective* value computed reactively from the
 * store's raw state fields (staged > appValues > workspaceValues > default).
 *
 * Per the store's reactivity note: `getEffectiveValue` is a store action that
 * reads current state, so calling it during render won't trigger re-renders.
 * Instead we select the raw state fields (`stagedChanges`, `appValues`,
 * `workspaceValues`) with `useSettingsStore` so the component re-renders when
 * any of them change, and compute the effective value inline.
 */

import {
  createElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import { Download, RotateCcw, Upload } from "lucide-react";
import type { SettingDefinition, SettingsDiagnostic } from "@thinkbrain/core";
import { Unavailable } from "../shell/Unavailable";
import { cn } from "../lib/utils";
import { appSettingsRegistry, useSettingsStore } from "./settingsStore";
import { getControlForDefinition } from "./controlRegistry";
import { subscribeSettingHighlight } from "./settingHighlight";
import { findSectionLabelAcrossModules } from "./sectionUtils";
import {
  buildThemeExportPayload,
  writeThemeExportFile,
  importTheme,
  type ImportThemeResult
} from "./themeImportExport";

/**
 * Computes the effective value for a setting key from the raw store fields.
 *
 * Resolution order: staged > appValues > workspaceValues > definition default.
 * This mirrors `SettingsStoreState.getEffectiveValue` but is computed inline
 * during render so React re-renders when the selected fields change.
 */
function computeEffectiveValue(
  key: string,
  defaultValue: unknown,
  staged: Record<string, unknown>,
  appValues: Record<string, unknown>,
  workspaceValues: Record<string, unknown> | null
): unknown {
  if (key in staged) return staged[key];
  if (key in appValues) return appValues[key];
  if (workspaceValues && key in workspaceValues) return workspaceValues[key];
  return defaultValue;
}

/**
 * Renders a single setting row: label, description, control, and any inline
 * validation diagnostics.
 *
 * The control component is resolved via `getControlForDefinition`. The value
 * is the effective value; `onChange` stages the change in the store. When
 * `diagnostics` are present (from a failed `saveSettings()`), each diagnostic
 * message renders below the control in a `role="alert"` element so screen
 * readers announce it. The store clears diagnostics for a key when the user
 * stages a new value for that key or when a re-save succeeds.
 */
function SettingRow({
  definition,
  value,
  onChange,
  diagnostics,
  highlighted
}: {
  readonly definition: SettingDefinition;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
  readonly diagnostics: readonly SettingsDiagnostic[];
  readonly highlighted: boolean;
}) {
  const ControlComponent = getControlForDefinition(definition);

  return (
    <div
      data-setting-key={definition.key}
      className={cn(
        "flex flex-col gap-1 py-2.5 rounded-small transition-colors",
        highlighted && "ring-2 ring-ring bg-accent"
      )}
    >
      <label className="text-sm font-semibold text-foreground" htmlFor={definition.key}>
        {definition.label}
      </label>
      {definition.description && (
        <p className="text-xs leading-relaxed text-muted-foreground">{definition.description}</p>
      )}
      <div className="mt-1">
        {/* Use createElement to render the dynamically-resolved control.
            JSX <ControlComponent /> would trip the react-hooks/static-components
            lint rule which flags component "creation" during render. */}
        {createElement(ControlComponent, { definition, value, onChange })}
      </div>
      {diagnostics.length > 0 && (
        <div className="mt-1 flex flex-col gap-0.5">
          {diagnostics.map((diagnostic, index) => (
            <p
              key={`${diagnostic.code}-${index}`}
              role="alert"
              className="text-xs text-destructive"
            >
              {diagnostic.message}
            </p>
          ))}
        </div>
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
function ThemeToolbar() {
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

/**
 * The settings content area.
 *
 * Reads `activeSection` and the raw value maps from the store. When no
 * section is selected, shows an empty-state prompt. Otherwise renders the
 * section header (with a per-section "Reset to defaults" button) and one row
 * per setting definition.
 */
export function SettingsContent() {
  const activeSection = useSettingsStore((s) => s.activeSection);
  // Subscribe to the raw value maps so controls re-render on any change.
  const stagedChanges = useSettingsStore((s) => s.stagedChanges);
  const appValues = useSettingsStore((s) => s.appValues);
  const workspaceValues = useSettingsStore((s) => s.workspaceValues);
  const stageChange = useSettingsStore((s) => s.stageChange);
  // Subscribe to validation diagnostics so inline errors render/clear reactively.
  const validationDiagnostics = useSettingsStore((s) => s.validationDiagnostics);

  // Track the currently highlighted setting key (from search-result clicks).
  // The highlight bus notifies with a key to highlight, then null to clear.
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  // Ref on the scrollable content container so the highlight effect can query
  // for the highlighted row and scroll it into view.
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    return subscribeSettingHighlight((key) => setHighlightKey(key));
  }, []);

  // When a setting is highlighted (from a search-result click), scroll its row
  // into view so the user can actually see it even if it's below the fold.
  // Uses useLayoutEffect so the scroll happens before paint, avoiding a flash.
  // The selector targets the `data-setting-key` attribute set by SettingRow.
  useLayoutEffect(() => {
    if (highlightKey === null) return;
    const container = containerRef.current;
    if (container === null) return;
    const row = container.querySelector<HTMLElement>(
      `[data-setting-key="${CSS.escape(highlightKey)}"]`
    );
    row?.scrollIntoView({ block: "center" });
  }, [highlightKey]);

  if (activeSection === null) {
    return (
      <Unavailable
        title="No section selected"
        description="Select a section from the left to view its settings."
      />
    );
  }

  const definitions = appSettingsRegistry.getDefinitionsForSection(activeSection);
  const sectionLabel = findSectionLabelAcrossModules(appSettingsRegistry, activeSection);

  // Determine whether any staged change belongs to the active section so the
  // per-section reset button can be enabled/disabled. `resetSection` only
  // clears staged entries for the section — it does NOT write to disk.
  const sectionKeys = new Set(definitions.map((d) => d.key));
  const hasStagedForSection = Object.keys(stagedChanges).some((k) =>
    sectionKeys.has(k)
  );

  /** Reverts staged changes for the active section to the last-saved values. */
  const handleResetSection = (): void => {
    useSettingsStore.getState().resetSection(activeSection);
  };

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[40rem] px-6 py-4">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-base font-semibold text-foreground">{sectionLabel}</h2>
          <button
            type="button"
            disabled={!hasStagedForSection}
            onClick={handleResetSection}
            title="Reset this section to defaults"
            aria-label="Reset this section to defaults"
            className={cn(
              "flex items-center gap-1 rounded-small px-1.5 py-0.5 text-xs",
              "text-muted-foreground bg-surface cursor-pointer",
              "hover:text-foreground hover:bg-accent transition-colors",
              !hasStagedForSection && "cursor-not-allowed opacity-40"
            )}
          >
            <RotateCcw className="size-3" aria-hidden="true" />
            <span>Reset</span>
          </button>
        </div>
        {definitions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This section has no settings yet.
          </p>
        ) : (
          <>
            {/* Theme export/import toolbar — only for the appearance.theme
                section. Renders above the setting rows so the actions are
                discoverable when browsing theme settings. */}
            {activeSection === "appearance.theme" && <ThemeToolbar />}
            <div className="divide-y divide-border">
            {definitions.map((definition) => (
              <SettingRow
                key={definition.key}
                definition={definition}
                value={computeEffectiveValue(
                  definition.key,
                  definition.default,
                  stagedChanges,
                  appValues,
                  workspaceValues
                )}
                onChange={(value) => stageChange(definition.key, value)}
                diagnostics={validationDiagnostics.filter(
                  (d) => d.path === definition.key
                )}
                highlighted={highlightKey === definition.key}
              />
            ))}
          </div>
          </>
        )}
      </div>
    </div>
  );
}
