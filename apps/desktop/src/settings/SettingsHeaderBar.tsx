/**
 * Settings header bar with location breadcrumbs and settings actions.
 *
 * The bar replaces the old bottom save bar when the settings tab adopts the
 * responsive header layout. Import/export behavior intentionally remains the
 * same so users receive identical file and status handling.
 */

import { useCallback, useState } from "react";
import { Download, Upload } from "lucide-react";
import type { SettingSection } from "@thinkbrain/core";
import { cn } from "../lib/utils";
import { appSettingsRegistry, useSettingsStore } from "./settingsStore";
import {
  buildExportPayload,
  importSettings,
  writeExportFile,
  type ImportResult
} from "./settingsImportExport";
import { findSectionLabelInSection } from "./sectionUtils";
import { useEffectiveValue } from "./useEffectiveValue";
import { useTransientStatus } from "./useTransientStatus";

/**
 * Finds the labels from a module's root section to its active descendant.
 *
 * Args:
 *   sections: Sections to search.
 *   sectionId: Active section id.
 *   ancestors: Labels accumulated from parent sections.
 *
 * Returns:
 *   The complete section label path, or `null` when the section is absent.
 */
function findSectionPath(
  sections: readonly SettingSection[],
  sectionId: string,
  ancestors: readonly string[] = []
): string[] | null {
  for (const section of sections) {
    const path = [...ancestors, section.label];
    if (section.id === sectionId) return path;

    if (section.subsections) {
      const descendantPath = findSectionPath(section.subsections, sectionId, path);
      if (descendantPath) return descendantPath;
    }
  }
  return null;
}

/**
 * Resolves the visible breadcrumb labels for the active settings section.
 *
 * Args:
 *   activeSection: The active section id, or `null` when no section is active.
 *
 * Returns:
 *   A module/section path, or `["Settings"]` when resolution fails.
 */
function buildBreadcrumbPath(activeSection: string | null): readonly string[] {
  if (!activeSection) return ["Settings"];

  // activeSection is scope-qualified (e.g. "app:editor.display") so the
  // scroll-spy can distinguish mixed-scope sections. Strip the scope prefix
  // for the breadcrumb lookup, which only needs the section id.
  const sectionId = activeSection.includes(":")
    ? activeSection.slice(activeSection.indexOf(":") + 1)
    : activeSection;

  for (const module of appSettingsRegistry.getAllModules()) {
    // Use the shared lookup to confirm this module owns the active section.
    if (!findSectionLabelInSection(module.sections, sectionId)) continue;

    const sectionPath = findSectionPath(module.sections, sectionId);
    if (sectionPath) return [module.label, ...sectionPath];
  }

  return ["Settings"];
}

/**
 * Header actions for settings persistence and portable file exchange.
 */
export function SettingsHeaderBar() {
  const activeSection = useSettingsStore((s) => s.activeSection);
  const isDirty = useSettingsStore((s) => s.isDirty);
  const dirtyCount = useSettingsStore((s) => s.dirtyCount);
  const saveError = useSettingsStore((s) => s.saveError);
  const autosave = useEffectiveValue("settings.autosave");
  const showAdvanced = useEffectiveValue("settings.showAdvanced") === true;
  const stageChange = useSettingsStore((s) => s.stageChange);
  const [isSaving, setIsSaving] = useState(false);
  const status = useTransientStatus();
  const breadcrumbPath = buildBreadcrumbPath(activeSection);

  /** Persists all staged settings while preventing overlapping saves. */
  async function handleSave(): Promise<void> {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await useSettingsStore.getState().saveSettings();
    } finally {
      setIsSaving(false);
    }
  }

  /** Reverts all staged settings to their last-saved values. */
  function handleReset(): void {
    useSettingsStore.getState().resetStaged();
  }

  /**
   * Builds the export payload, confirms non-portable values, and writes JSON.
   */
  const handleExport = useCallback((): void => {
    const { json, portableWarnings } = buildExportPayload();

    if (portableWarnings.length > 0) {
      const proceed = window.confirm(
        `${portableWarnings.length} setting(s) may not work on another machine. Export anyway?`
      );
      if (!proceed) return;
    }

    void writeExportFile(json)
      .then((written) => {
        if (written) status.show("Settings exported.");
      })
      .catch(() => {
        status.show("Export failed: could not write file.");
      });
  }, [status]);

  /**
   * Opens an import dialog, validates the selected file, and stages its values.
   */
  const handleImport = useCallback((): void => {
    void importSettings()
      .then((result: ImportResult | null) => {
        if (result === null) return;

        const parts: string[] = [`Imported ${result.imported} setting(s)`];
        if (result.ignored > 0) parts.push(`ignored ${result.ignored} unknown key(s)`);
        if (result.typeMismatches > 0) {
          parts.push(`${result.typeMismatches} type mismatch(es)`);
        }
        status.show(parts.join(", ") + ".");
      })
      .catch(() => {
        status.show("Import failed: the file could not be read.");
      });
  }, [status]);

  const saveLabel = isSaving
    ? "Saving…"
    : dirtyCount > 0
      ? `Save (${dirtyCount})`
      : "Save";
  const actionDisabled = !isDirty || isSaving;

  return (
    <header
      className="flex min-h-8 flex-none items-center justify-between gap-3 border-b border-border bg-editor px-[0.9rem] py-1 text-[0.72rem] text-muted-foreground max-[760px]:min-h-11"
      data-testid="settings-header-bar"
      aria-label="Settings header"
    >
      <nav className="flex min-w-0 items-center truncate" aria-label="Settings location">
        {breadcrumbPath.map((segment, index) => (
          <span
            key={`${segment}-${index}`}
            className={cn(
              "flex min-w-0 items-center truncate",
              index === breadcrumbPath.length - 1
                ? "text-foreground"
                : "text-muted-foreground"
            )}
          >
            {index > 0 && (
              <span
                className="select-none px-[0.28rem] text-muted-foreground/60"
                aria-hidden="true"
              >
                ›
              </span>
            )}
            <span className="min-w-0 truncate">{segment}</span>
          </span>
        ))}
      </nav>

      <div className="flex items-center gap-2" role="toolbar" aria-label="Settings actions">
        {status.message && (
          <span className="text-xs text-muted-foreground" role="status" title={status.message}>
            {status.message}
          </span>
        )}
        {saveError && (
          <span className="mr-auto text-destructive" role="alert" title={saveError}>
            {saveError}
          </span>
        )}

        <label className="flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showAdvanced}
            onChange={(event) => stageChange("settings.showAdvanced", event.target.checked)}
            aria-label="Show advanced settings"
          />
          <span>Advanced</span>
        </label>

        <button
          type="button"
          onClick={handleExport}
          title="Export settings"
          aria-label="Export settings"
          className="flex cursor-pointer items-center justify-center rounded-small border-0 bg-surface p-[0.35rem] text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground max-[760px]:size-11"
        >
          <Download size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={handleImport}
          title="Import settings"
          aria-label="Import settings"
          className="flex cursor-pointer items-center justify-center rounded-small border-0 bg-surface p-[0.35rem] text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground max-[760px]:size-11"
        >
          <Upload size={14} aria-hidden="true" />
        </button>

        {autosave ? (
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
              disabled={actionDisabled}
              onClick={handleReset}
              aria-label="Reset all unsaved settings"
              className={cn(
                "cursor-pointer rounded-small border border-border bg-surface px-[0.6rem] py-[0.4rem] font-inherit text-xs text-foreground max-[760px]:min-h-11 max-[760px]:min-w-11",
                actionDisabled && "cursor-not-allowed opacity-50",
                isSaving && "cursor-wait opacity-70"
              )}
            >
              Reset
            </button>
            <button
              type="button"
              disabled={actionDisabled}
              onClick={() => void handleSave()}
              className={cn(
                "cursor-pointer rounded-small border border-border bg-primary px-[0.6rem] py-[0.4rem] font-inherit text-xs text-primary-foreground enabled:hover:opacity-90 max-[760px]:min-h-11 max-[760px]:min-w-11",
                actionDisabled && "cursor-not-allowed opacity-50",
                isSaving && "cursor-wait opacity-70"
              )}
            >
              {saveLabel}
            </button>
          </>
        )}
      </div>
    </header>
  );
}
