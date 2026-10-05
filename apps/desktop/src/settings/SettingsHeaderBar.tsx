/**
 * Settings header bar with location breadcrumbs and settings actions.
 *
 * The bar replaces the old bottom save bar when the settings tab adopts the
 * responsive header layout. Import/export behavior intentionally remains the
 * same so users receive identical file and status handling.
 */

import { useCallback, useRef, useState } from "react";
import { Download, MoreVertical, RotateCcw, Upload } from "lucide-react";
import { cn } from "../lib/utils";
import { Menu, MenuButton, MenuCheckbox, MenuSeparator } from "../shell/Menu";
import { appSettingsRegistry, selectDirtyCount, selectIsDirty, useSettingsStore } from "./settingsStore";
import {
  buildExportPayload,
  importSettings,
  writeExportFile,
  type ImportResult
} from "./settingsImportExport";
import { findSectionLabelPath, parseQualifiedSectionId } from "./sectionUtils";
import { useEffectiveValue } from "./useEffectiveValue";
import { useTransientStatus } from "./useTransientStatus";

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
  const { sectionId } = parseQualifiedSectionId(activeSection);

  for (const module of appSettingsRegistry.getAllModules()) {
    const sectionPath = findSectionLabelPath(module.sections, sectionId);
    if (sectionPath) return [module.label, ...sectionPath];
  }

  return ["Settings"];
}

/**
 * Header actions for settings persistence and portable file exchange.
 */
export function SettingsHeaderBar() {
  const activeSection = useSettingsStore((s) => s.activeSection);
  const isDirty = useSettingsStore(selectIsDirty);
  const dirtyCount = useSettingsStore(selectDirtyCount);
  const saveError = useSettingsStore((s) => s.saveError);
  const autosave = useEffectiveValue("settings.autosave");
  const showAdvanced = useEffectiveValue("settings.showAdvanced") === true;
  const stageChange = useSettingsStore((s) => s.stageChange);
  const [isSaving, setIsSaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuAnchorRef = useRef<HTMLButtonElement>(null);
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

      <div className="relative flex items-center gap-2" role="toolbar" aria-label="Settings actions">
        {status.message && (
          <span className="min-w-0 truncate text-xs text-muted-foreground" role="status" title={status.message}>
            {status.message}
          </span>
        )}
        {saveError && (
          <span className="mr-auto min-w-0 truncate text-destructive" role="alert" title={saveError}>
            {saveError}
          </span>
        )}

        {/* Secondary actions collapse into the ⋯ menu on phone-sized bars —
            Save stays out because it is the action the bar exists for. */}
        <label className="flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground max-[760px]:hidden">
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
          className="flex cursor-pointer items-center justify-center rounded-small border-0 bg-surface p-[0.35rem] text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground max-[760px]:hidden"
        >
          <Download size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={handleImport}
          title="Import settings"
          aria-label="Import settings"
          className="flex cursor-pointer items-center justify-center rounded-small border-0 bg-surface p-[0.35rem] text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground max-[760px]:hidden"
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
                "cursor-pointer rounded-small border border-border bg-surface px-[0.6rem] py-[0.4rem] font-inherit text-xs text-foreground max-[760px]:hidden",
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
                "cursor-pointer rounded-small border border-border bg-primary px-[0.6rem] py-[0.4rem] font-inherit text-xs text-primary-foreground enabled:hover:opacity-90 max-[760px]:min-h-11",
                actionDisabled && "cursor-not-allowed opacity-50",
                isSaving && "cursor-wait opacity-70"
              )}
            >
              {saveLabel}
            </button>
          </>
        )}

        <button
          type="button"
          ref={menuAnchorRef}
          aria-label="More settings actions"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className="hidden max-[760px]:flex size-11 cursor-pointer items-center justify-center rounded-small border-0 bg-transparent text-muted-foreground tn-focus-ring active:bg-accent"
        >
          <MoreVertical size={16} aria-hidden="true" />
        </button>
        {menuOpen && (
          <Menu
            anchorRef={menuAnchorRef}
            className="absolute right-0 top-full z-50 mt-1 w-52"
            onClose={() => setMenuOpen(false)}
          >
            <MenuCheckbox
              label="Show advanced settings"
              checked={showAdvanced}
              className="max-[760px]:min-h-11 max-[760px]:text-sm"
              onClick={() => stageChange("settings.showAdvanced", !showAdvanced)}
            />
            <MenuButton
              label="Export settings"
              icon={<Download aria-hidden="true" />}
              className="max-[760px]:min-h-11 max-[760px]:text-sm"
              onClick={() => {
                setMenuOpen(false);
                handleExport();
              }}
            />
            <MenuButton
              label="Import settings"
              icon={<Upload aria-hidden="true" />}
              className="max-[760px]:min-h-11 max-[760px]:text-sm"
              onClick={() => {
                setMenuOpen(false);
                handleImport();
              }}
            />
            {!autosave && (
              <>
                <MenuSeparator />
                <MenuButton
                  label="Reset unsaved changes"
                  icon={<RotateCcw aria-hidden="true" />}
                  disabled={actionDisabled}
                  className="max-[760px]:min-h-11 max-[760px]:text-sm"
                  onClick={() => {
                    setMenuOpen(false);
                    handleReset();
                  }}
                />
              </>
            )}
          </Menu>
        )}
      </div>
    </header>
  );
}
