/**
 * Settings content area: renders every registered settings section.
 *
 * For each setting definition in every visible section, renders a row with the
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
import type {
  SettingDefinition,
  SettingScope,
  SettingsDiagnostic,
  SettingsModule,
  SettingSection
} from "@thinkbrain/core";
import { cn } from "../lib/utils";
import { Unavailable } from "../shell/Unavailable";
import { appSettingsRegistry, useSettingsStore } from "./settingsStore";
import { getControlForDefinition } from "./controlRegistry";
import { subscribeSettingHighlight } from "./settingHighlight";
import { resolveEffectiveValue } from "./settingsHelpers";
import { ThemePicker, ThemeToolbar } from "./ThemeSectionControls";
import { useEffectiveValue } from "./useEffectiveValue";

const SECTION_ID_PREFIX = "settings-section-";
const HIDDEN_SETTING_ROWS = new Set([
  "appearance.theme",
  "appearance.themeFile",
  "sync.signInProfile"
]);

interface RenderedSection {
  readonly section: SettingSection;
  readonly scope: SettingScope;
}

/**
 * Builds a scope-qualified id for a rendered section.
 *
 * Mixed-scope modules (e.g. Journal) project the same section id into both
 * app and workspace scope groups. Qualifying with scope keeps DOM ids unique
 * and lets the scroll-spy distinguish which projection is on screen.
 */
function scopeQualifiedId(scope: SettingScope, sectionId: string): string {
  return `${scope}:${sectionId}`;
}

/** Flattens projected module trees while preserving module and section order. */
function flattenModuleSections(
  modules: readonly SettingsModule[],
  scope: SettingScope
): RenderedSection[] {
  const flattened: RenderedSection[] = [];
  const visit = (sections: readonly SettingSection[]): void => {
    for (const section of sections) {
      flattened.push({ section, scope });
      if (section.subsections) visit(section.subsections);
    }
  };
  for (const module of modules) visit(module.sections);
  return flattened;
}

/**
 * Whether a setting holds anything other than its declared default.
 *
 * An advanced row the user has actually changed stays visible: hiding it
 * would leave them with a behaviour they chose and no way to find where they
 * chose it.
 */
function isChanged(
  definition: SettingDefinition,
  stagedChanges: Record<string, unknown>,
  appValues: Record<string, unknown>,
  workspaceValues: Record<string, unknown> | null
): boolean {
  const effective = resolveEffectiveValue(
    definition.key,
    stagedChanges,
    appValues,
    workspaceValues,
    definition
  );
  return effective !== definition.default;
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
  // Custom controls (e.g. GitLinkControl, HistoryPolicyControl) render their
  // own full-width UI and don't fit the two-column label/control grid.
  const isCustomControl = Boolean(definition.control);

  return (
    <div
      data-setting-key={definition.key}
      data-highlighted={highlighted ? "true" : undefined}
      className={cn(
        "grid gap-4 rounded-small border-b border-border py-2.5 transition-[background-color,box-shadow] duration-150",
        isCustomControl
          ? "grid-cols-[minmax(0,1fr)]"
          : "grid-cols-[minmax(0,1fr)_auto] max-[760px]:grid-cols-[minmax(0,1fr)]",
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
      <div
        className={cn(
          "mt-1",
          isCustomControl
            ? "w-full"
            : "self-center justify-self-end max-[760px]:w-full max-[760px]:justify-self-stretch max-[760px]:[&_button:not([role=switch])]:min-h-11 max-[760px]:[&_input]:min-h-11 max-[760px]:[&_select]:min-h-11 max-[760px]:[&_input:not([type=number])]:w-full max-[760px]:[&_input:not([type=number])]:max-w-none max-[760px]:[&_select]:w-full max-[760px]:[&_select]:max-w-none"
        )}
      >
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
 * Renders one section within the single-page settings document.
 */
function SettingsSection({
  renderedSection,
  stagedChanges,
  validationDiagnostics,
  highlightKey,
  revealedKeys,
  showAdvanced,
  setSectionRef
}: {
  readonly renderedSection: RenderedSection;
  readonly stagedChanges: Readonly<Record<string, unknown>>;
  readonly validationDiagnostics: readonly SettingsDiagnostic[];
  readonly highlightKey: string | null;
  readonly revealedKeys: ReadonlySet<string>;
  readonly showAdvanced: boolean;
  readonly setSectionRef: (sectionId: string, element: HTMLElement | null) => void;
}) {
  const { section, scope } = renderedSection;
  const qualifiedId = scopeQualifiedId(scope, section.id);
  const stageChange = useSettingsStore((state) => state.stageChange);
  const appValues = useSettingsStore((state) => state.appValues);
  const workspaceValues = useSettingsStore((state) => state.workspaceValues);
  const allDefinitions = appSettingsRegistry
    .getDefinitionsForSection(section.id)
    .filter((definition) => definition.scope === scope);
  // The `appearance.theme` section is rendered via the unified `ThemePicker`
  // (which stages both `appearance.theme` and `appearance.themeFile`) plus the
  // `ThemeToolbar` (Export/Import). `sync.signInProfile` is edited inside
  // GitLinkControl. Those standalone generic rows are redundant — filter them
  // out so they don't render twice. The registry definitions stay so the
  // settings system still knows about them.
  const definitions = allDefinitions
    .filter((d) => !HIDDEN_SETTING_ROWS.has(d.key))
    .filter(
      (d) =>
        !d.advanced ||
        showAdvanced ||
        revealedKeys.has(d.key) ||
        isChanged(d, stagedChanges, appValues, workspaceValues)
    );

  // Determine whether any staged change belongs to this section so the
  // per-section reset button can be enabled/disabled. `resetSection` only
  // clears staged entries for the section — it does NOT write to disk. Note:
  // use the full set of section keys (including hidden ones) so staging a
  // theme via the unified picker still enables the Reset button.
  const sectionKeys = new Set(allDefinitions.map((d) => d.key));
  const hasStagedForSection = Object.keys(stagedChanges).some((k) =>
    sectionKeys.has(k)
  );

  /** Reverts staged changes for this section to the last-saved values. */
  const handleResetSection = (): void => {
    useSettingsStore.getState().resetSection(section.id);
  };

  return (
    <section
      id={`${SECTION_ID_PREFIX}${qualifiedId}`}
      ref={(element) => setSectionRef(qualifiedId, element)}
      className="scroll-mt-4 py-4 first:pt-4"
      aria-labelledby={`${SECTION_ID_PREFIX}${qualifiedId}-heading`}
    >
      <div className="mb-2 flex items-center gap-2">
        <h2
          id={`${SECTION_ID_PREFIX}${qualifiedId}-heading`}
          className="text-base font-semibold text-foreground"
        >
          {section.label}
        </h2>
        <button
          type="button"
          disabled={!hasStagedForSection}
          onClick={handleResetSection}
          title="Reset this section to defaults"
          aria-label={`Reset ${section.label} to defaults`}
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
          {/* Theme controls replace the hidden generic theme rows. */}
          {section.id === "appearance.theme" && scope === "app" && (
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
                  (diagnostic) => diagnostic.path === definition.key
                )}
                highlighted={highlightKey === definition.key}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/**
 * The one-page settings document and its content-rooted scroll-spy.
 */
export function SettingsContent() {
  const workspaceValues = useSettingsStore((state) => state.workspaceValues);
  const stagedChanges = useSettingsStore((state) => state.stagedChanges);
  // Subscribe so inline validation diagnostics render and clear reactively.
  const validationDiagnostics = useSettingsStore((state) => state.validationDiagnostics);
  const setActiveSection = useSettingsStore((state) => state.setActiveSection);
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  // A highlight clears itself after ~1200ms. Reveal must not: a row that
  // appears when search lands on it and then disappears mid-read is worse
  // than one that never appeared, so revealed keys are latched for the life
  // of this settings view.
  const [revealedKeys, setRevealedKeys] = useState<ReadonlySet<string>>(new Set());
  const showAdvanced = useEffectiveValue("settings.showAdvanced") === true;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef(new Map<string, HTMLElement>());

  // Scope projection matches the navigation: app sections precede workspace
  // sections, and workspace sections only exist while a workspace is open.
  const appSections = flattenModuleSections(
    appSettingsRegistry.getModulesByScope("app"),
    "app"
  );
  const renderedSections =
    workspaceValues === null
      ? appSections
      : [
          ...appSections,
          ...flattenModuleSections(
            appSettingsRegistry.getModulesByScope("workspace"),
            "workspace"
          )
        ];
  const sectionIdsKey = renderedSections
    .map(({ section, scope }) => `${scope}:${section.id}`)
    .join("|");

  /** Keeps the map used by both the observer and section-ref requirement current. */
  const setSectionRef = (sectionId: string, element: HTMLElement | null): void => {
    if (element) sectionRefs.current.set(sectionId, element);
    else sectionRefs.current.delete(sectionId);
  };

  useEffect(
    () =>
      subscribeSettingHighlight((key) => {
        setHighlightKey(key);
        if (key !== null) setRevealedKeys((current) => new Set(current).add(key));
      }),
    []
  );

  // Search highlights target the containing section rather than a lone row so
  // its heading and context remain visible after navigation.
  useLayoutEffect(() => {
    if (highlightKey === null) return;
    const row = containerRef.current?.querySelector<HTMLElement>(
      `[data-setting-key="${CSS.escape(highlightKey)}"]`
    );
    row?.closest<HTMLElement>("section")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }, [highlightKey]);

  useEffect(() => {
    const root = containerRef.current;
    if (root === null) return;

    // The active section is the last one whose top has crossed a threshold
    // line 20% down the scroll container — the standard scroll-spy technique.
    // Every section is treated identically regardless of depth, scope, or
    // height. A passive scroll listener fires on every frame so the highlight
    // stays correct even at the very top or bottom of the scroll area, where
    // an IntersectionObserver might not fire (no intersection *change*).
    const THRESHOLD_FRACTION = 0.2;
    const recompute = (): void => {
      const threshold = root.getBoundingClientRect().top + root.clientHeight * THRESHOLD_FRACTION;
      let active: string | null = null;
      for (const [id, element] of sectionRefs.current) {
        if (element.getBoundingClientRect().top <= threshold) active = id;
        else break; // sections are in document order; nothing past here qualifies
      }
      if (active !== null && useSettingsStore.getState().activeSection !== active) {
        setActiveSection(active);
      }
    };

    root.addEventListener("scroll", recompute, { passive: true });
    recompute();
    return () => root.removeEventListener("scroll", recompute);
  }, [sectionIdsKey, setActiveSection]);

  if (renderedSections.length === 0) {
    return (
      <Unavailable
        title="No settings available"
        description="No settings sections are currently registered."
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex min-h-0 grow flex-col overflow-y-auto"
      data-testid="settings-content-scroll"
    >
      <div className="mx-auto w-full max-w-160 px-6 max-[760px]:max-w-none max-[760px]:pr-4 max-[760px]:pb-8 max-[760px]:pl-15">
        {renderedSections.map((renderedSection) => (
          <SettingsSection
            key={`${renderedSection.scope}:${renderedSection.section.id}`}
            renderedSection={renderedSection}
            stagedChanges={stagedChanges}
            validationDiagnostics={validationDiagnostics}
            highlightKey={highlightKey}
            revealedKeys={revealedKeys}
            showAdvanced={showAdvanced}
            setSectionRef={setSectionRef}
          />
        ))}
      </div>
    </div>
  );
}
