import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction
} from "react";

import { intersectPaths, type JournalFacet, type JournalPredicate } from "./journalFacets";
import { JournalError, type JournalListing, type JournalService } from "./journalService";
import type { JournalStatus } from "./journalViewModel";

/**
 * The entries query behind {@link JournalPanelContainer}: the folder listing
 * itself, plus the three index-backed questions — facet values, metadata
 * matches and content matches — that decide what the listing is filtered to.
 *
 * Every answer is kept with the question it answered, so a result for a query
 * the user has already moved on from is ignored rather than shown as a filter
 * of the new one. Each ask is a cancelled-flag effect: a workspace switch or a
 * re-read can land while a round trip is in flight, and a stale result must
 * not overwrite the newer one.
 */

/** A pause long enough to mean "done typing", short enough not to feel laggy. */
const SEARCH_DEBOUNCE_MS = 200;

/** One identity for "no predicates", so a render with none is not a new question. */
const EMPTY_PREDICATES: readonly JournalPredicate[] = [];

export interface UseJournalEntriesQueryInput {
  readonly service: JournalService;
  /**
   * What the listing is of — workspace root plus journal folder. A
   * kept-mounted panel never remounts, so a vault switch or a `root`
   * setting change arrives as a new key and re-reads the folder.
   */
  readonly listKey: string;
  /** False until the platform index is ready for this workspace (D41). */
  readonly indexAvailable: boolean;
  /** Asks the index which entries match a content query (D41). */
  readonly searchEntries?: (query: string) => Promise<ReadonlySet<string>>;
  /** The fields and values the index holds for this folder (D41). */
  readonly loadFacets?: () => Promise<readonly JournalFacet[]>;
  /** The entries satisfying every active predicate (D43). */
  readonly matchEntries?: (
    predicates: readonly JournalPredicate[]
  ) => Promise<ReadonlySet<string>>;
}

export interface JournalEntriesQuery {
  readonly status: JournalStatus;
  readonly listing: JournalListing | null;
  /** Re-reads the folder, after an action changed it or a read failed. */
  readonly reload: () => void;
  /** Back to loading and a fresh read, for the failure states' Retry. */
  readonly retry: () => void;
  readonly search: string;
  readonly setSearch: Dispatch<SetStateAction<string>>;
  /** The search box is only honest while the index can answer (D41). */
  readonly searchAvailable: boolean;
  /** The filter menu only exists while the index can answer it (D41/D43). */
  readonly filtersAvailable: boolean;
  readonly facets: readonly JournalFacet[];
  /**
   * The predicates actually in force.
   *
   * Empty while the index cannot answer them: a chip claiming to filter by a
   * value nothing is checking is a lie the user cannot see through. They come
   * back with the index, because the panel never threw them away.
   */
  readonly active: readonly JournalPredicate[];
  readonly setPredicates: Dispatch<SetStateAction<readonly JournalPredicate[]>>;
  /**
   * Paths matching the content query, or `null` when no content filter runs —
   * which is not the same as a query that matched nothing: that one has to
   * read as "no matches" (D52). A query still in flight also filters nothing,
   * rather than showing the last one's answer.
   */
  readonly searchPaths: ReadonlySet<string> | null;
  /** D16: the search runs inside the filter, not beside it. */
  readonly matchingPaths: ReadonlySet<string> | null;
}

export function useJournalEntriesQuery({
  service,
  listKey,
  indexAvailable,
  searchEntries,
  loadFacets,
  matchEntries
}: UseJournalEntriesQueryInput): JournalEntriesQuery {
  const [status, setStatus] = useState<JournalStatus>("loading");
  const [listing, setListing] = useState<JournalListing | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [search, setSearch] = useState("");
  const [matches, setMatches] = useState<{
    readonly query: string;
    readonly paths: ReadonlySet<string>;
  } | null>(null);
  const [facets, setFacets] = useState<readonly JournalFacet[]>([]);
  const [predicates, setPredicates] = useState<readonly JournalPredicate[]>([]);
  // Keyed by the predicate list it answered, compared by identity — which is
  // exactly what `active` below preserves across renders.
  const [metadataMatches, setMetadataMatches] = useState<{
    readonly of: readonly JournalPredicate[];
    readonly paths: ReadonlySet<string>;
  } | null>(null);

  /** Reads the folder without touching state, so the effect owns when to apply it. */
  const read = useCallback(async (): Promise<{
    readonly status: JournalStatus;
    readonly listing: JournalListing | null;
  }> => {
    try {
      return { status: "ready", listing: await service.listEntries() };
    } catch (error: unknown) {
      // The service already turned this into approved copy (D63); the panel
      // only needs to know which state to draw.
      return {
        status: error instanceof JournalError ? error.code : "unreadable",
        listing: null
      };
    }
  }, [service]);

  useEffect(() => {
    // A workspace switch can land while a read is in flight; the stale result
    // must not overwrite the newer one.
    let cancelled = false;
    void read().then((next) => {
      if (cancelled) return;
      setStatus(next.status);
      setListing(next.listing);
    });
    return () => {
      cancelled = true;
    };
  }, [read, reloadToken, listKey]);

  const filtersAvailable =
    indexAvailable && loadFacets !== undefined && matchEntries !== undefined;
  const active = useMemo(
    () => (filtersAvailable ? predicates : EMPTY_PREDICATES),
    [filtersAvailable, predicates]
  );

  // Re-asked when the folder is re-read: a new entry can carry a value no entry
  // had before, and a deleted one can take the last of its own.
  useEffect(() => {
    if (!filtersAvailable || loadFacets === undefined || listing === null) return;
    let cancelled = false;
    void loadFacets()
      .then((found) => {
        if (!cancelled) setFacets(found);
      })
      .catch((error: unknown) => {
        console.error("[journal] Reading filter values failed.", error);
        // Offering nothing is honest; offering a stale vocabulary is not.
        if (!cancelled) setFacets([]);
      });
    return () => {
      cancelled = true;
    };
  }, [filtersAvailable, loadFacets, listing]);

  // `listing` is a dependency without being read: a re-read folder can hold a
  // new entry that satisfies the filter, and nothing else would ask again.
  useEffect(() => {
    if (active.length === 0 || matchEntries === undefined) return;
    let cancelled = false;
    void matchEntries(active)
      .then((paths) => {
        if (!cancelled) setMetadataMatches({ of: active, paths });
      })
      .catch((error: unknown) => {
        // As with search: fail loudly, but never strand the list behind a
        // filter that could not be computed.
        console.error("[journal] Filtering by metadata failed.", error);
        if (!cancelled) setMetadataMatches(null);
      });
    return () => {
      cancelled = true;
    };
  }, [active, matchEntries, listing]);

  const query = search.trim();
  const searching = indexAvailable && searchEntries !== undefined && query !== "";
  const searchPaths = searching && matches?.query === query ? matches.paths : null;
  const metadataPaths =
    active.length > 0 && metadataMatches?.of === active ? metadataMatches.paths : null;
  const matchingPaths = intersectPaths(searchPaths, metadataPaths);

  // Typing is not a query. Each one is a round trip to the index, so the panel
  // waits for a pause before asking, and drops an answer that arrives after the
  // query moved on.
  useEffect(() => {
    if (!searching || searchEntries === undefined) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      void searchEntries(query)
        .then((paths) => {
          if (!cancelled) setMatches({ query, paths });
        })
        .catch((error: unknown) => {
          // Fail loudly, but do not strand the list behind a filter it could
          // not compute: showing everything is the honest fallback.
          console.error("[journal] Search failed.", error);
          if (!cancelled) setMatches(null);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, searching, searchEntries]);

  // Stable identity: the container's note-event subscriptions key on it.
  const reload = useCallback((): void => setReloadToken((token) => token + 1), []);
  const retry = (): void => {
    setStatus("loading");
    reload();
  };

  return {
    status,
    listing,
    reload,
    retry,
    search,
    setSearch,
    searchAvailable: indexAvailable && searchEntries !== undefined,
    filtersAvailable,
    facets,
    active,
    setPredicates,
    searchPaths,
    matchingPaths
  };
}
