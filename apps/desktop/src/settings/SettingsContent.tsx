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
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import { RotateCcw } from "lucide-react";
import type { SettingDefinition, SettingsDiagnostic } from "@thinkbrain/core";
import { Unavailable } from "../shell/Unavailable";
import { cn } from "../lib/utils";
import { appSettingsRegistry, useSettingsStore } from "./settingsStore";
import { resolveEffectiveValue } from "./settingsHelpers";
import { getControlForDefinition } from "./controlRegistry";
import { subscribeSettingHighlight } from "./settingHighlight";
import { findSectionLabelAcrossModules } from "./sectionUtils";
import { ThemePicker, ThemeToolbar } from "./ThemeSectionControls";

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

  const allDefinitions = appSettingsRegistry.getDefinitionsForSection(activeSection);
  const sectionLabel = findSectionLabelAcrossModules(appSettingsRegistry, activeSection);

  // The `appearance.theme` section is rendered via the unified `ThemePicker`
  // (which stages both `appearance.theme` and `appearance.themeFile`) plus the
  // `ThemeToolbar` (Export/Import). `sync.signInProfile` is edited inside
  // GitLinkControl. Those standalone generic rows are redundant — filter them
  // out so they don't render twice. The registry definitions stay so the
  // settings system still knows about them.
  const HIDDEN_SETTING_ROWS = new Set([
    "appearance.theme",
    "appearance.themeFile",
    "sync.signInProfile"
  ]);
  const definitions = allDefinitions.filter((d) => !HIDDEN_SETTING_ROWS.has(d.key));

  // Determine whether any staged change belongs to the active section so the
  // per-section reset button can be enabled/disabled. `resetSection` only
  // clears staged entries for the section — it does NOT write to disk. Note:
  // use the full set of section keys (including hidden ones) so staging a
  // theme via the unified picker still enables the Reset button.
  const sectionKeys = new Set(allDefinitions.map((d) => d.key));
  const hasStagedForSection = Object.keys(stagedChanges).some((k) =>
    sectionKeys.has(k)
  );

  /** Reverts staged changes for the active section to the last-saved values. */
  const handleResetSection = (): void => {
    useSettingsStore.getState().resetSection(activeSection);
  };

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-160 px-6 py-4">
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
        {allDefinitions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This section has no settings yet.
          </p>
        ) : (
          <>
            {/* Unified theme picker + export/import toolbar — only for the
                appearance.theme section. The picker combines the base
                System/Light/Dark options with discovered preset files into a
                single dropdown; the toolbar keeps the Export/Import actions.
                Both render above the setting rows (the standalone
                appearance.theme and appearance.themeFile rows are filtered out
                above to avoid duplication). */}
            {activeSection === "appearance.theme" && (
              <>
                <ThemePicker />
                <ThemeToolbar />
              </>
            )}
            <div className="divide-y divide-border">
            {definitions.map((definition) => (
              <SettingRow
                key={definition.key}
                definition={definition}
                value={resolveEffectiveValue(
                  definition.key,
                  stagedChanges,
                  appValues,
                  workspaceValues,
                  definition
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
