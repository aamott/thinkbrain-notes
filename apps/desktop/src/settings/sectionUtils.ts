/**
 * Shared helpers for resolving setting section labels from the settings
 * registry. Extracted from `SettingsNav.tsx` and `SettingsContent.tsx` to
 * eliminate duplication and remove the unsafe `unknown[]` casts that the
 * `SettingsContent` version previously relied on.
 */

import type { SettingSection } from "@thinkbrain/core";

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
