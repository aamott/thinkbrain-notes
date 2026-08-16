import type { IndexMetadataValue } from "@thinkbrain/core";

/**
 * The metadata filter's arithmetic, kept away from React and the index (D41).
 *
 * The panel owns no metadata of its own: it hands the platform index a set of
 * predicates and filters its rows by the paths that come back. What is left
 * here is the part that has to be right — which predicates are active, and how
 * a metadata filter and a search combine — and it is pure, so it is testable
 * without a workspace.
 */

/** One field/value pair the user is filtering by. */
export interface JournalPredicate {
  readonly key: string;
  readonly value: IndexMetadataValue;
}

/** A field the user can filter by, with the values the index actually holds. */
export interface JournalFacet {
  readonly key: string;
  /** The configured field's label, or the frontmatter key where none is (D45). */
  readonly label: string;
  readonly values: readonly IndexMetadataValue[];
}

/** One dismissible active filter (D60). */
export interface JournalChip {
  readonly id: string;
  readonly label: string;
}

/**
 * A predicate's identity.
 *
 * JSON rather than a join, because `rating: 7` and `rating: "7"` are different
 * facts about a note and the index stores them as different types.
 */
export function predicateId(predicate: JournalPredicate): string {
  return `${predicate.key}=${JSON.stringify(predicate.value)}`;
}

/**
 * Turns one value on or off.
 *
 * Two values of the same field stay side by side rather than replacing each
 * other: predicates are ANDed within one entry (D43), so that asks for entries
 * carrying both, which is a question the user is allowed to ask.
 */
export function togglePredicate(
  active: readonly JournalPredicate[],
  predicate: JournalPredicate
): readonly JournalPredicate[] {
  const id = predicateId(predicate);
  const without = active.filter((existing) => predicateId(existing) !== id);
  return without.length === active.length ? [...active, predicate] : without;
}

/**
 * Combines two path filters, where `null` means "not filtering".
 *
 * An empty set is not the same as `null`: it says the filter ran and matched
 * nothing, which the panel has to draw as "no matches" (D52) rather than as
 * every entry.
 */
export function intersectPaths(
  left: ReadonlySet<string> | null,
  right: ReadonlySet<string> | null
): ReadonlySet<string> | null {
  if (left === null) return right;
  if (right === null) return left;
  return new Set([...left].filter((path) => right.has(path)));
}

/** Active filters as chips, named the way a screen reader should read them. */
export function predicateChips(
  active: readonly JournalPredicate[],
  facets: readonly JournalFacet[]
): readonly JournalChip[] {
  return active.map((predicate) => ({
    id: predicateId(predicate),
    label: `${facets.find((facet) => facet.key === predicate.key)?.label ?? predicate.key} ${predicate.value}`
  }));
}
