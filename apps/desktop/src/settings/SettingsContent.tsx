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

import { createElement, useEffect, useState } from "react";
import type { SettingDefinition, SettingsDiagnostic } from "@thinkbrain/core";
import { Unavailable } from "../shell/Unavailable";
import { cn } from "../lib/utils";
import { appSettingsRegistry, useSettingsStore } from "./settingsStore";
import { getControlForDefinition } from "./controlRegistry";
import { subscribeSettingHighlight } from "./settingHighlight";

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
 * Looks up the label for a section id by scanning all registered modules.
 *
 * Section ids are globally unique by convention (e.g. "editor.display"), so
 * the first match wins. Returns the id itself as a fallback.
 */
function findSectionLabel(sectionId: string): string {
  for (const module of appSettingsRegistry.getAllModules()) {
    const label = searchSections(module.sections, sectionId);
    if (label) return label;
  }
  return sectionId;
}

/** Recursively searches a section tree for a matching section id. */
function searchSections(
  sections: readonly { id: string; label: string; subsections?: readonly unknown[] }[],
  sectionId: string
): string | undefined {
  for (const section of sections) {
    if (section.id === sectionId) return section.label;
    if (section.subsections) {
      const found = searchSections(
        section.subsections as readonly { id: string; label: string; subsections?: readonly unknown[] }[],
        sectionId
      );
      if (found) return found;
    }
  }
  return undefined;
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
 * The settings content area.
 *
 * Reads `activeSection` and the raw value maps from the store. When no
 * section is selected, shows an empty-state prompt. Otherwise renders the
 * section header and one row per setting definition.
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
  useEffect(() => {
    return subscribeSettingHighlight((key) => setHighlightKey(key));
  }, []);

  if (activeSection === null) {
    return (
      <Unavailable
        title="No section selected"
        description="Select a section from the left to view its settings."
      />
    );
  }

  const definitions = appSettingsRegistry.getDefinitionsForSection(activeSection);
  const sectionLabel = findSectionLabel(activeSection);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[40rem] px-6 py-4">
        <h2 className="mb-2 text-base font-semibold text-foreground">{sectionLabel}</h2>
        {definitions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This section has no settings yet.
          </p>
        ) : (
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
        )}
      </div>
    </div>
  );
}
