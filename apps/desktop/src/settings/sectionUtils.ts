/**
 * Shared helpers for navigating the settings section tree and for the string
 * ids the nav, content anchors, and scroll-spy share.
 */

import type { SettingScope, SettingSection } from "@thinkbrain/core";

/** The DOM id prefix a rendered settings section anchors under. */
const SECTION_ANCHOR_PREFIX = "settings-section-";

/**
 * Builds the `scope:sectionId` id the nav and scroll-spy share.
 *
 * Mixed-scope modules (e.g. Journal) project the same section id into both app
 * and workspace scope groups; qualifying with scope keeps DOM ids unique and
 * lets the scroll-spy distinguish which projection is on screen.
 */
export function qualifiedSectionId(scope: SettingScope, sectionId: string): string {
  return `${scope}:${sectionId}`;
}

/**
 * Strips the `scope:` prefix off a qualified section id, returning the bare
 * section id. An id with no scope prefix — produced before scopes existed, or
 * in tests — comes back unchanged.
 */
export function parseQualifiedSectionId(qualifiedId: string): string {
  const separator = qualifiedId.indexOf(":");
  return separator < 0 ? qualifiedId : qualifiedId.slice(separator + 1);
}

/** The DOM anchor id a rendered section scrolls to. */
export function sectionAnchorId(qualifiedId: string): string {
  return `${SECTION_ANCHOR_PREFIX}${qualifiedId}`;
}

/**
 * Recursively searches a section tree for `sectionId` and returns the labels
 * from the tree's root section down to it.
 *
 * Args:
 *   sections: The sections (and their subsections) to search.
 *   sectionId: The section id to find.
 *   ancestors: Labels accumulated from parent sections (internal recursion).
 *
 * Returns:
 *   The complete label path, or `null` when the section is absent.
 */
export function findSectionLabelPath(
  sections: readonly SettingSection[],
  sectionId: string,
  ancestors: readonly string[] = []
): string[] | null {
  for (const section of sections) {
    const path = [...ancestors, section.label];
    if (section.id === sectionId) return path;

    if (section.subsections) {
      const descendantPath = findSectionLabelPath(section.subsections, sectionId, path);
      if (descendantPath) return descendantPath;
    }
  }
  return null;
}
