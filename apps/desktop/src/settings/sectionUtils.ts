/**
 * Shared helpers for resolving setting section labels from the settings
 * registry. Extracted from `SettingsNav.tsx` and `SettingsContent.tsx` to
 * eliminate duplication and remove the unsafe `unknown[]` casts that the
 * `SettingsContent` version previously relied on.
 */

import type { SettingSection, SettingsRegistry } from "@thinkbrain/core";

/**
 * Recursively searches a section tree for a section matching `sectionId` and
 * returns its label.
 *
 * This is the typed equivalent of the previous `SettingsNav.findSectionLabel`
 * helper: it walks `section.subsections` (typed as `readonly SettingSection[]`)
 * rather than casting through `unknown[]`, so the compiler verifies the shape
 * at every recursion level.
 *
 * Args:
 *   sections: The sections (and their subsections) to search.
 *   sectionId: The section id to find.
 *
 * Returns:
 *   The matching section's label, or `undefined` if not found.
 */
export function findSectionLabelInSection(
  sections: readonly SettingSection[],
  sectionId: string
): string | undefined {
  for (const section of sections) {
    if (section.id === sectionId) return section.label;
    if (section.subsections) {
      const found = findSectionLabelInSection(section.subsections, sectionId);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Looks up the label for a section id by scanning all modules in a settings
 * registry.
 *
 * Section ids are globally unique by convention (e.g. "editor.display"), so
 * the first match wins. Returns the `sectionId` itself as a fallback when no
 * registered section matches — this preserves the previous `SettingsContent`
 * behavior so callers always receive a displayable string.
 *
 * Args:
 *   registry: The settings registry to search across all modules.
 *   sectionId: The section id to resolve.
 *
 * Returns:
 *   The resolved section label, or the `sectionId` if no match is found.
 */
export function findSectionLabelAcrossModules(
  registry: SettingsRegistry,
  sectionId: string
): string {
  for (const module of registry.getAllModules()) {
    const label = findSectionLabelInSection(module.sections, sectionId);
    if (label) return label;
  }
  return sectionId;
}
