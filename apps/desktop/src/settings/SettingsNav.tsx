/**
 * Settings left navigation tree with search/filter.
 *
 * Renders a search input at the top, followed by either the normal
 * `role="tree"` (module → section → subsection hierarchy) or a flat results
 * list when a search query is active. Top-level tree groups are "Application"
 * (app-scoped modules) and "Workspace" (workspace-scoped modules, only when a
 * workspace is open). Clicking a section sets it as the active nav target.
 * Subsections are collapsible via a chevron toggle (local component state).
 *
 * Search filters all registry definitions by case-insensitive substring match
 * against label, description, and full key. Clicking a result clears the
 * query, navigates to the setting's section, and requests a brief highlight
 * on the matching row in the content area.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import type {
  SettingDefinition,
  SettingSection,
  SettingsModule
} from "@thinkbrain/core";
import { cn } from "../lib/utils";
import { appSettingsRegistry, useSettingsStore } from "./settingsStore";
import { requestSettingHighlight } from "./settingHighlight";

/**
 * Recursively renders a section and its subsections as tree items.
 *
 * Sections that directly hold settings are clickable nav targets (they set
 * `activeSection`). Sections with subsections render a collapsible group with
 * a chevron; a section can be both a nav target and have subsections.
 *
 * Args:
 *   section: The section to render.
 *   level: Indentation depth (0 = top-level within a module).
 *   activeSection: The currently active section id, or null.
 *   onSelect: Callback to set the active section.
 */
function SectionTreeItem({
  section,
  level,
  activeSection,
  onSelect
}: {
  readonly section: SettingSection;
  readonly level: number;
  readonly activeSection: string | null;
  readonly onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasSubsections = Boolean(section.subsections && section.subsections.length > 0);
  const hasSettings = Boolean(section.settings && section.settings.length > 0);
  const isActive = activeSection === section.id;
  const indent = level * 0.75; // rem per nesting level

  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <li role="none" className="list-none">
      <div role="treeitem" className="flex items-center" style={{ paddingLeft: `${indent}rem` }}>
        {hasSubsections && (
          <button
            type="button"
            aria-label={expanded ? "Collapse subsection" : "Expand subsection"}
            onClick={() => setExpanded((v) => !v)}
            className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
          >
            <Chevron className="size-3" />
          </button>
        )}
        {!hasSubsections && <span className="w-4 shrink-0" />}

        <button
          type="button"
          // Only sections with settings are selectable nav targets.
          disabled={!hasSettings}
          aria-current={isActive ? "true" : undefined}
          onClick={() => hasSettings && onSelect(section.id)}
          className={cn(
            "flex-1 truncate rounded px-1.5 py-1 text-left text-xs leading-relaxed",
            "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
            isActive
              ? "bg-surface font-medium text-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
            !hasSettings && "cursor-default opacity-70 hover:bg-transparent"
          )}
        >
          {section.label}
        </button>
      </div>

      {hasSubsections && expanded && (
        <ul role="group" className="m-0 p-0">
          {section.subsections!.map((sub) => (
            <SectionTreeItem
              key={sub.id}
              section={sub}
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

/**
 * Renders a single module's sections as a subtree.
 */
function ModuleGroup({
  module,
  activeSection,
  onSelect
}: {
  readonly module: SettingsModule;
  readonly activeSection: string | null;
  readonly onSelect: (id: string) => void;
}) {
  return (
    <li role="treeitem" aria-expanded="true" className="list-none">
      <div className="px-1 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {module.label}
      </div>
      <ul role="group" className="m-0 p-0">
        {module.sections.map((section) => (
          <SectionTreeItem
            key={section.id}
            section={section}
            level={0}
            activeSection={activeSection}
            onSelect={onSelect}
          />
        ))}
      </ul>
    </li>
  );
}

/**
 * Recursively searches a section tree for a section matching `sectionId` and
 * returns its label. Used to build the "Module > Section" path for search
 * results.
 *
 * Args:
 *   sections: The sections (and their subsections) to search.
 *   sectionId: The section id to find.
 *
 * Returns:
 *   The matching section's label, or undefined if not found.
 */
function findSectionLabel(
  sections: readonly SettingSection[],
  sectionId: string
): string | undefined {
  for (const section of sections) {
    if (section.id === sectionId) return section.label;
    if (section.subsections) {
      const found = findSectionLabel(section.subsections, sectionId);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Builds the "Module > Section" path label for a setting definition.
 *
 * The module id is the segment before the first dot of the full key. The
 * section label is found by scanning the module's sections for one whose id
 * matches `definition.section`. Falls back to the raw section id if the
 * module or section label can't be resolved.
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
    ? findSectionLabel(module.sections, definition.section) ?? definition.section
    : definition.section;
  return `${moduleLabel} > ${sectionLabel}`;
}

/**
 * Filters all registry definitions by a case-insensitive substring match
 * against label, description, and full key.
 *
 * Args:
 *   query: The raw search query (will be trimmed and lowercased).
 *
 * Returns:
 *   Matching definitions in registry registration order.
 */
function filterDefinitions(query: string): readonly SettingDefinition[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === "") return [];
  return appSettingsRegistry.getAllDefinitions().filter((def) => {
    return (
      def.label.toLowerCase().includes(trimmed) ||
      def.description.toLowerCase().includes(trimmed) ||
      def.key.toLowerCase().includes(trimmed)
    );
  });
}

/**
 * Renders the flat search results list. Each row shows the setting label and
 * its module/section path. Clicking a row clears the query, navigates to the
 * setting's section, and requests a highlight on the row in the content area.
 */
function SearchResults({
  results,
  onSelect
}: {
  readonly results: readonly SettingDefinition[];
  readonly onSelect: (definition: SettingDefinition) => void;
}) {
  if (results.length === 0) {
    return (
      <p className="px-2 py-4 text-center text-xs text-muted-foreground">
        No results
      </p>
    );
  }

  return (
    <ul role="list" className="m-0 flex flex-col gap-0.5 p-0">
      {results.map((def) => (
        <li key={def.key} role="none" className="list-none">
          <button
            type="button"
            onClick={() => onSelect(def)}
            className="flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
          >
            <span className="text-xs font-medium text-foreground">
              {def.label}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {buildSectionPath(def)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * The settings navigation tree with search.
 *
 * Reads `activeSection`, `searchQuery`, `workspaceValues`, `setActiveSection`,
 * and `setSearchQuery` from the settings store. When `searchQuery` is non-empty
 * (after trim), the tree is replaced by a flat results list. The "Workspace"
 * group only renders when `workspaceValues` is non-null (i.e. a workspace is
 * open). Modules are sourced from the module-scoped `appSettingsRegistry`.
 */
export function SettingsNav() {
  const activeSection = useSettingsStore((s) => s.activeSection);
  const workspaceValues = useSettingsStore((s) => s.workspaceValues);
  const setActiveSection = useSettingsStore((s) => s.setActiveSection);
  const searchQuery = useSettingsStore((s) => s.searchQuery);
  const setSearchQuery = useSettingsStore((s) => s.setSearchQuery);

  const appModules = appSettingsRegistry.getModulesByScope("app");
  const workspaceModules = appSettingsRegistry.getModulesByScope("workspace");

  const trimmedQuery = searchQuery.trim();
  const isSearching = trimmedQuery !== "";
  const results = isSearching ? filterDefinitions(searchQuery) : [];

  /**
   * Handles a search result click: clears the query, navigates to the
   * setting's section, and requests a highlight on the row.
   */
  function handleResultSelect(definition: SettingDefinition): void {
    setSearchQuery("");
    setActiveSection(definition.section);
    requestSettingHighlight(definition.key);
  }

  return (
    <nav
      className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2"
      aria-label="Settings sections"
    >
      {/* Search input: sticky at the top so it stays visible while results
          scroll. bg-surface prevents results from bleeding through. */}
      <div className="sticky top-0 z-10 -m-2 mb-1 bg-surface p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setSearchQuery("");
              }
            }}
            placeholder="Search settings…"
            aria-label="Search settings"
            className={cn(
              "w-full rounded-small border border-border bg-surface py-1.5 pl-7 pr-2 text-xs text-foreground",
              "placeholder:text-muted-foreground",
              "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
            )}
          />
        </div>
      </div>

      {isSearching ? (
        <SearchResults results={results} onSelect={handleResultSelect} />
      ) : (
      <ul role="tree" className="m-0 flex flex-col gap-1 p-0">
        <li role="treeitem" aria-expanded="true" className="list-none">
          <div className="px-1 py-1 text-xs font-semibold uppercase tracking-wide text-foreground">
            Application
          </div>
          <ul role="group" className="m-0 p-0">
            {appModules.map((module) => (
              <ModuleGroup
                key={module.id}
                module={module}
                activeSection={activeSection}
                onSelect={setActiveSection}
              />
            ))}
          </ul>
        </li>

        {workspaceValues !== null && workspaceModules.length > 0 && (
          <li role="treeitem" aria-expanded="true" className="list-none">
            <div className="px-1 py-1 text-xs font-semibold uppercase tracking-wide text-foreground">
              Workspace
            </div>
            <ul role="group" className="m-0 p-0">
              {workspaceModules.map((module) => (
                <ModuleGroup
                  key={module.id}
                  module={module}
                  activeSection={activeSection}
                  onSelect={setActiveSection}
                />
              ))}
            </ul>
          </li>
        )}
      </ul>
      )}
    </nav>
  );
}
