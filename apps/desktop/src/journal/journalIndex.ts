import type { JournalFieldDefinition } from "@thinkbrain/core";

import {
  useSearchIndexStore,
  type MetadataIndexQueryResult
} from "../search/searchIndexStore";
import type { MetadataQuery, SearchService } from "../search/searchService";
import type { JournalFacet, JournalPredicate } from "./journalFacets";

/**
 * The journal's half of the platform-index contract (D41).
 *
 * The panel owns no index of its own: it asks the platform index which entries
 * match a query, which values the configured fields hold, and which entries
 * satisfy the active predicates — then filters its rows by the answers. This
 * file is the pure part of that exchange; the extension's activation file only
 * wires it to the live service and store.
 */

/**
 * Hits the journal asks the index for, at the native ceiling.
 *
 * The panel wants membership rather than a ranking — every entry that matches,
 * so it can filter its rows — and a search box's default of 50 is far short of
 * that for a journal kept for a year. This is still a cap: a query matching
 * more than this many entries hides the rest, silently. Raising the native
 * ceiling belongs to the search story, not here.
 */
export const JOURNAL_SEARCH_LIMIT = 200;

/**
 * Asks the platform index which journal entries match, and nothing else.
 *
 * Scoping is the whole point of the folder argument: the limit is applied by
 * the query, so an unscoped search ranks the entire vault first and hands back
 * whichever journal entries survived. In a vault where the journal is a small
 * share of the notes, that is most of them gone with nothing said.
 *
 * Answers with no matches at all while there is no index, rather than every
 * entry: the panel disables its search box in that state (D41), and a set
 * standing in for "ask again later" would show rows as though they matched.
 */
export async function searchJournalEntries(
  search: SearchService["search"],
  indexRoot: string | null,
  journalRoot: string,
  query: string
): Promise<ReadonlySet<string>> {
  if (indexRoot === null) return new Set();
  const hits = await search(indexRoot, query, {
    pathPrefix: journalRoot,
    limit: JOURNAL_SEARCH_LIMIT
  });
  return new Set(hits.map((hit) => hit.relativePath));
}

/** What the panel needs of {@link useSearchIndexStore.queryMetadata}, and no more. */
export type QueryMetadata = (
  rootPath: string,
  query: MetadataQuery
) => Promise<MetadataIndexQueryResult>;

/** Read rather than subscribed: a query is an event, not a rendered value. */
export const queryMetadata: QueryMetadata = (rootPath, query) =>
  useSearchIndexStore.getState().queryMetadata(rootPath, query);

/**
 * The fields and values the journal folder holds, for the filter menu (D41).
 *
 * Asked without predicates on purpose: the index computes facet values over the
 * entries a query matched, so passing the active filters would narrow `mood` to
 * the one value already chosen and leave no way to pick another. The vocabulary
 * belongs to the folder; only the matching set belongs to the filters.
 *
 * A field the user has stopped configuring keeps its frontmatter key as its
 * label (D45) — the entries still carry the values, so the filter still offers
 * them.
 */
export async function journalFacetValues(
  queryMetadata: QueryMetadata,
  indexRoot: string | null,
  journalRoot: string,
  definitions: readonly JournalFieldDefinition[]
): Promise<readonly JournalFacet[]> {
  const facetKeys = definitions.map((definition) => definition.id);
  // Nothing configured is nothing to ask about: the query would return empty
  // facets at the cost of a round trip.
  if (indexRoot === null || facetKeys.length === 0) return [];

  const result = await queryMetadata(indexRoot, {
    pathPrefix: journalRoot,
    facetKeys,
    predicates: []
  });
  if (result.kind !== "available") return [];

  return result.facets.map((facet) => ({
    key: facet.key,
    label: definitions.find((definition) => definition.id === facet.key)?.label ?? facet.key,
    values: facet.values
  }));
}

/**
 * The entries satisfying every active predicate (D43).
 *
 * Asks for no facet values: the menu already has them, and the native side
 * skips the second query entirely when none are wanted.
 */
export async function journalMetadataMatches(
  queryMetadata: QueryMetadata,
  indexRoot: string | null,
  journalRoot: string,
  predicates: readonly JournalPredicate[]
): Promise<ReadonlySet<string>> {
  if (indexRoot === null) return new Set();
  const result = await queryMetadata(indexRoot, {
    pathPrefix: journalRoot,
    facetKeys: [],
    predicates
  });
  // Nothing matched is the honest answer for a filter that could not be run:
  // the panel disables the control in that state, so no new filter can be set.
  return result.kind === "available" ? new Set(result.matchingPaths) : new Set();
}

/**
 * Resolves the `startOfWeek` setting to a `WeekStart` (0=Sunday, 1=Monday).
 *
 * `"system"` defers to the OS locale's first day of week via `Intl.Locale`;
 * 1=Monday maps to 1, anything else (7=Sunday) maps to 0. Falls back to Sunday
 * if the locale info is unavailable.
 */
export function resolveWeekStart(setting: string | undefined): 0 | 1 {
  if (setting === "monday") return 1;
  if (setting === "sunday") return 0;
  try {
    // `weekInfo` is not in the TS lib DOM types; cast to access it at runtime.
    const locale = new Intl.Locale(navigator.language) as Intl.Locale & {
      weekInfo?: { firstDay?: number };
    };
    return locale.weekInfo?.firstDay === 1 ? 1 : 0;
  } catch {
    return 0;
  }
}
