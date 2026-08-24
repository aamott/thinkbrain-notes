/**
 * Settings content area: renders the controls for the active section.
 *
 * For each setting definition in the active section, renders a row with the
 * label, description, and the auto-generated (or custom) control. The
 * control's value is the *effective* value computed reactively by
 * `useEffectiveValue` (staged > appValues > workspaceValues > default).
 *
 * Per the store's reactivity note: `getEffectiveValue` is a store action that
 * reads current state, so calling it during render won't trigger re-renders.
 * Instead, `useEffectiveValue` subscribes to the raw state fields so each
 * setting row re-renders when any of them change.
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
import { cn } from "../lib/utils";
import { Unavailable } from "../shell/Unavailable";
import { appSettingsRegistry, useSettingsStore } from "./settingsStore";
import { getControlForDefinition } from "./controlRegistry";
import { subscribeSettingHighlight } from "./settingHighlight";
import { findSectionLabelAcrossModules } from "./sectionUtils";
import { ThemePicker, ThemeToolbar } from "./ThemeSectionControls";
import { useEffectiveValue } from "./useEffectiveValue";

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
  onChange,
  diagnostics,
  highlighted
}: {
  readonly definition: SettingDefinition;
  readonly onChange: (value: unknown) => void;
  readonly diagnostics: readonly SettingsDiagnostic[];
  readonly highlighted: boolean;
}) {
  const ControlComponent = getControlForDefinition(definition);
  const value = useEffectiveValue(definition.key);

  return (
    <div
      data-setting-key={definition.key}
      data-highlighted={highlighted ? "true" : undefined}
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] gap-4 rounded-small border-b border-border py-2.5 transition-[background-color,box-shadow] duration-150 max-[760px]:grid-cols-[minmax(0,1fr)]",
        highlighted && "bg-accent ring-2 ring-ring"
      )}
    >
      <div className="flex flex-col gap-1">
        <label className="text-sm font-semibold text-foreground" htmlFor={definition.key}>
          {definition.label}
        </label>
        {definition.description && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {definition.description}
          </p>
        )}
      </div>
      <div className="mt-1 self-center justify-self-end max-[760px]:w-full max-[760px]:justify-self-stretch max-[760px]:[&_button]:min-h-11 max-[760px]:[&_input]:min-h-11 max-[760px]:[&_select]:min-h-11 max-[760px]:[&_input:not([type=number])]:w-full max-[760px]:[&_input:not([type=number])]:max-w-none max-[760px]:[&_select]:w-full max-[760px]:[&_select]:max-w-none">
        {/* Use createElement to render the dynamically-resolved control.
            JSX <ControlComponent /> would trip the react-hooks/static-components
            lint rule which flags component "creation" during render. */}
        {createElement(ControlComponent, { definition, value, onChange })}
      </div>
      {diagnostics.length > 0 && (
        <div className="col-span-full mt-1 flex flex-col gap-0.5 max-[760px]:col-span-1">
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
  const stagedChanges = useSettingsStore((s) => s.stagedChanges);
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
    <div ref={containerRef} className="flex min-h-0 grow flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-160 px-6 py-4 max-[760px]:max-w-none max-[760px]:pt-4 max-[760px]:pr-4 max-[760px]:pb-8 max-[760px]:pl-15">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-base font-semibold text-foreground">{sectionLabel}</h2>
          <button
            type="button"
            disabled={!hasStagedForSection}
            onClick={handleResetSection}
            title="Reset this section to defaults"
            aria-label="Reset this section to defaults"
            className={cn(
              "flex cursor-pointer items-center gap-1 rounded-small border-0 bg-surface px-1.5 py-0.5 text-xs text-muted-foreground transition-colors duration-150 enabled:hover:bg-accent enabled:hover:text-foreground focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring max-[760px]:min-h-11",
              !hasStagedForSection && "cursor-not-allowed opacity-40"
            )}
          >
            <RotateCcw className="size-3 flex-none" aria-hidden="true" />
            <span>Reset</span>
          </button>
        </div>
        {allDefinitions.length === 0 ? (
          <p className="text-sm text-muted-foreground">This section has no settings yet.</p>
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
            <div className="flex flex-col">
              {definitions.map((definition) => (
                <SettingRow
                  key={definition.key}
                  definition={definition}
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
