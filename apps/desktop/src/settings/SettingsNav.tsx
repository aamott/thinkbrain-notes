/**
 * Settings left navigation tree with search/filter.
 *
 * Renders a search input at the top, followed by either the normal
 * `role="tree"` (module → section → subsection hierarchy) or a flat results
 * list when a search query is active. Top-level tree groups are "Application"
 * (settings whose scope is `"app"`) and "Workspace" (settings whose scope is
 * `"workspace"`, only when a workspace is open). A mixed-scope module appears
 * in both, projected to the matching settings. Clicking a section scrolls its
 * content anchor into view while the content scroll-spy owns active state.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import type {
  SettingDefinition,
  SettingScope,
  SettingSection,
  SettingsModule
} from "@thinkbrain/core";
import { cn } from "../lib/utils";
import { createDebounced } from "../lib/debounce";
import { appSettingsRegistry, useSettingsStore } from "./settingsStore";
import { fuzzySearch, type FuzzySearchField } from "./fuzzyMatch";
import { requestSettingHighlight } from "./settingHighlight";
import { findSectionLabelInSection } from "./sectionUtils";

const SEARCH_DEBOUNCE_MS = 150;
const SEARCH_RESULT_ROW_HEIGHT = 52;
const SEARCH_FIELDS: readonly FuzzySearchField<SettingDefinition>[] = [
  { value: (definition) => definition.label, weight: 3 },
  { value: (definition) => definition.description, weight: 2 },
  { value: (definition) => definition.key, weight: 1 }
];

export interface SettingsNavProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

/** Smoothly scrolls the single-page content to a registered section anchor. */
function scrollToSection(sectionId: string): void {
  document.getElementById(`settings-section-${sectionId}`)?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

/**
 * Recursively renders a section and its subsections as tree items.
 *
 * Args:
 *   section: The section to render.
 *   level: Accessibility depth within the module.
 *   activeSection: The currently active section id, or null.
 *   onSelect: Callback to select a section.
 */
function SectionTreeItem({
  section,
  scope,
  level,
  activeSection,
  onSelect
}: {
  readonly section: SettingSection;
  readonly scope: SettingScope;
  readonly level: number;
  readonly activeSection: string | null;
  readonly onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasSubsections = Boolean(section.subsections && section.subsections.length > 0);
  const hasSettings = Boolean(section.settings && section.settings.length > 0);
  const qualifiedId = `${scope}:${section.id}`;
  const isActive = activeSection === qualifiedId;
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <li role="none" className="list-none">
      <div
        role="treeitem"
        aria-level={level + 2}
        aria-expanded={hasSubsections ? expanded : undefined}
        className="flex items-center"
      >
        {hasSubsections && (
          <button
            type="button"
            aria-label={expanded ? "Collapse subsection" : "Expand subsection"}
            onClick={() => setExpanded((value) => !value)}
            className="flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-small text-muted-foreground hover:text-foreground max-[760px]:min-h-11 max-[760px]:min-w-11"
          >
            <Chevron className="size-3" aria-hidden="true" />
          </button>
        )}
        {!hasSubsections && <span className="w-4 shrink-0" />}

        <button
          type="button"
          disabled={!hasSettings}
          aria-current={isActive ? "true" : undefined}
          onClick={() => hasSettings && onSelect(qualifiedId)}
          className={cn(
            "min-w-0 flex-1 cursor-pointer truncate rounded-small px-1.5 py-1 text-left text-xs leading-relaxed text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring max-[760px]:min-h-11",
            isActive && "bg-surface font-medium text-foreground",
            !hasSettings && "cursor-default opacity-70 hover:bg-transparent"
          )}
        >
          {section.label}
        </button>
      </div>

      {hasSubsections && expanded && (
        <ul role="group" className="m-0 ps-3">
          {section.subsections!.map((subsection) => (
            <SectionTreeItem
              key={subsection.id}
              section={subsection}
              scope={scope}
              level={level + 1}
              activeSection={activeSection}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Renders a single module's sections as a subtree. */
function ModuleGroup({
  module,
  scope,
  activeSection,
  onSelect
}: {
  readonly module: SettingsModule;
  readonly scope: SettingScope;
  readonly activeSection: string | null;
  readonly onSelect: (id: string) => void;
}) {
  return (
    <li role="treeitem" aria-expanded="true" className="list-none">
      <div className="p-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {module.label}
      </div>
      <ul role="group" className="m-0 p-0">
        {module.sections.map((section) => (
          <SectionTreeItem
            key={section.id}
            section={section}
            scope={scope}
            level={0}
            activeSection={activeSection}
            onSelect={onSelect}
          />
        ))}
      </ul>
    </li>
  );
}

/** Renders an Application or Workspace scope group. */
function ScopeGroup({
  label,
  scope,
  modules,
  activeSection,
  onSelect
}: {
  readonly label: string;
  readonly scope: SettingScope;
  readonly modules: readonly SettingsModule[];
  readonly activeSection: string | null;
  readonly onSelect: (id: string) => void;
}) {
  return (
    <li role="treeitem" aria-expanded="true" className="list-none">
      <div className="p-1 text-xs font-semibold uppercase tracking-wider text-foreground">
        {label}
      </div>
      <ul role="group" className="m-0 p-0">
        {modules.map((module) => (
          <ModuleGroup
            key={module.id}
            module={module}
            scope={scope}
            activeSection={activeSection}
            onSelect={onSelect}
          />
        ))}
      </ul>
    </li>
  );
}

/**
 * Builds the "Module > Section" path label for a setting definition.
 *
 * Args:
 *   definition: The setting definition to build a path for.
 *
 * Returns:
 *   A string like "Editor > Display".
 */
function buildSectionPath(definition: SettingDefinition): string {
  const moduleId = definition.key.slice(0, definition.key.indexOf("."));
  const module = appSettingsRegistry.getModule(moduleId);
  const moduleLabel = module?.label ?? moduleId;
  const sectionLabel = module
    ? findSectionLabelInSection(module.sections, definition.section) ?? definition.section
    : definition.section;
  return `${moduleLabel} > ${sectionLabel}`;
}

/** Searches all registry definitions and returns them best-match first. */
function filterDefinitions(query: string): readonly SettingDefinition[] {
  return fuzzySearch(query, appSettingsRegistry.getAllDefinitions(), SEARCH_FIELDS).map(
    ({ item }) => item
  );
}

/** Renders only the visible portion of the flat search results list. */
function SearchResults({
  results,
  onSelect
}: {
  readonly results: readonly SettingDefinition[];
  readonly onSelect: (definition: SettingDefinition) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // TanStack Virtual manages mutable measurements intentionally; this component
  // remains outside React Compiler memoization so those measurements stay live.
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => SEARCH_RESULT_ROW_HEIGHT,
    getItemKey: (index) => results[index]?.key ?? index,
    overscan: 5,
    // This initial measurement keeps server-like DOM environments useful until
    // ResizeObserver supplies the real panel size in a browser.
    initialRect: { width: 224, height: 400 }
  });

  useEffect(() => {
    rowVirtualizer.scrollToOffset(0);
  }, [results, rowVirtualizer]);

  if (results.length === 0) {
    return <p className="px-2 py-4 text-center text-xs text-muted-foreground">No results</p>;
  }

  const virtualRows = rowVirtualizer.getVirtualItems();

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-y-auto"
      data-testid="settings-search-results-viewport"
    >
      <ul
        role="list"
        className="relative m-0 p-0"
        style={{ height: rowVirtualizer.getTotalSize() }}
      >
        {virtualRows.map((virtualRow) => {
          const definition = results[virtualRow.index]!;
          return (
            <li
              key={definition.key}
              role="none"
              className="absolute inset-s-0 top-0 w-full list-none p-0.5"
              style={{
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`
              }}
            >
              <button
                type="button"
                onClick={() => onSelect(definition)}
                className="flex h-full w-full cursor-pointer flex-col justify-center gap-0.5 rounded-small px-2 text-left hover:bg-accent focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring max-[760px]:min-h-11"
              >
                <span className="truncate text-xs font-medium text-foreground">
                  {definition.label}
                </span>
                <span className="truncate text-[0.625rem] text-muted-foreground">
                  {buildSectionPath(definition)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Settings navigation tree and narrow-screen overlay.
 *
 * Args:
 *   open: Whether the responsive overlay is open.
 *   onClose: Closes the overlay and restores focus to its trigger.
 */
export function SettingsNav({ open, onClose }: SettingsNavProps) {
  const activeSection = useSettingsStore((state) => state.activeSection);
  const workspaceValues = useSettingsStore((state) => state.workspaceValues);
  const searchQuery = useSettingsStore((state) => state.searchQuery);
  const setSearchQuery = useSettingsStore((state) => state.setSearchQuery);
  const [inputValue, setInputValue] = useState(searchQuery);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const debouncedSetSearchQuery = useMemo(
    () => createDebounced(setSearchQuery, SEARCH_DEBOUNCE_MS),
    [setSearchQuery]
  );

  useEffect(() => {
    if (open) searchInputRef.current?.focus();
  }, [open]);

  useEffect(
    () => () => {
      debouncedSetSearchQuery.cancel();
    },
    [debouncedSetSearchQuery]
  );

  const appModules = appSettingsRegistry.getModulesByScope("app");
  const workspaceModules = appSettingsRegistry.getModulesByScope("workspace");
  const isSearching = searchQuery.trim() !== "";
  const results = useMemo(
    () => (isSearching ? filterDefinitions(searchQuery) : []),
    [isSearching, searchQuery]
  );

  /** Scrolls to a section without closing the responsive navigation. */
  function handleSectionSelect(id: string): void {
    scrollToSection(id);
  }

  /** Clears search, scrolls to the result's section, and highlights its row. */
  function handleResultSelect(definition: SettingDefinition): void {
    debouncedSetSearchQuery.cancel();
    setInputValue("");
    setSearchQuery("");
    scrollToSection(`${definition.scope}:${definition.section}`);
    requestSettingHighlight(definition.key);
  }

  return (
    <nav
      id="settings-navigation"
      className={cn(
        "flex min-h-0 w-56 shrink-0 flex-col overflow-hidden border-r border-border bg-sidebar p-2 text-sidebar-foreground max-[760px]:invisible max-[760px]:pointer-events-none max-[760px]:absolute max-[760px]:inset-y-0 max-[760px]:inset-s-0 max-[760px]:z-30 max-[760px]:w-[min(15rem,calc(100%-2rem))] max-[760px]:-translate-x-full max-[760px]:shadow-panel max-[760px]:transition-[transform_180ms_ease,visibility_0s_linear_180ms]",
        open && "max-[760px]:visible max-[760px]:pointer-events-auto max-[760px]:translate-x-0 max-[760px]:delay-0"
      )}
      aria-label="Settings sections"
      data-open={open ? "true" : "false"}
    >
      <div className="-mx-2 -mt-2 mb-1 flex shrink-0 items-center gap-1 bg-surface p-2">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            ref={searchInputRef}
            type="search"
            value={inputValue}
            onChange={(event) => {
              const nextQuery = event.target.value;
              setInputValue(nextQuery);
              debouncedSetSearchQuery(nextQuery);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              debouncedSetSearchQuery.cancel();
              setInputValue("");
              setSearchQuery("");
            }}
            placeholder="Search settings…"
            aria-label="Search settings"
            className="w-full rounded-small border border-border bg-surface py-1.5 pr-2 pl-7 text-xs placeholder:text-muted-foreground focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring max-[760px]:min-h-11"
          />
        </div>
        <button
          type="button"
          className="hidden cursor-pointer items-center justify-center rounded-small text-muted-foreground hover:text-foreground max-[760px]:flex max-[760px]:size-11"
          aria-label="Close settings navigation"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </button>
      </div>

      {isSearching ? (
        <SearchResults results={results} onSelect={handleResultSelect} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ul role="tree" className="m-0 flex flex-col gap-1 p-0">
            <ScopeGroup
              label="Application"
              scope="app"
              modules={appModules}
              activeSection={activeSection}
              onSelect={handleSectionSelect}
            />
            {workspaceValues !== null && workspaceModules.length > 0 && (
              <ScopeGroup
                label="Workspace"
                scope="workspace"
                modules={workspaceModules}
                activeSection={activeSection}
                onSelect={handleSectionSelect}
              />
            )}
          </ul>
        </div>
      )}
    </nav>
  );
}
