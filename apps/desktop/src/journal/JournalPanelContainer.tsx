import { useCallback, useEffect, useMemo, useState } from "react";

import { createDebounced } from "../lib/debounce";
import { JournalPanel } from "./JournalPanel";
import {
  intersectPaths,
  predicateChips,
  predicateId,
  togglePredicate,
  type JournalChip,
  type JournalFacet,
  type JournalPredicate
} from "./journalFacets";
import { selectJournalDay, useJournalFilter } from "./journalFilterStore";
import { buildJournalView, type JournalStatus } from "./journalViewModel";
import { formatJournalDate } from "@thinkbrain/core";
import { JournalError, type JournalListing, type JournalService } from "./journalService";

/**
 * Holds the popout's state and drives the service.
 *
 * Split from {@link JournalPanel} so the panel stays presentational: every one
 * of its fourteen states is reachable in a test without a workspace, and this
 * file owns the parts that need one.
 */

/**
 * First lines read at once.
 *
 * Enough that a screenful arrives in a couple of rounds, few enough not to
 * flood the IPC bridge and hold up whatever else wants it.
 */
const PREVIEW_CONCURRENCY = 8;

/** A pause long enough to mean "done typing", short enough not to feel laggy. */
const SEARCH_DEBOUNCE_MS = 200;

/** One identity for "no predicates", so a render with none is not a new question. */
const EMPTY_PREDICATES: readonly JournalPredicate[] = [];

export interface JournalPanelContainerProps {
  readonly service: JournalService;
  /** False until the platform index is ready for this workspace (D41). */
  readonly indexAvailable?: boolean;
  /**
   * Asks the index which entries match, as workspace-relative paths.
   *
   * The panel never scans files itself (D41): it hands over a query and filters
   * its rows by what comes back. Omitted where no index is wired, which is why
   * `indexAvailable` and this arrive together — a search box that accepts
   * typing and does nothing is worse than one that says it is unavailable.
   */
  readonly searchEntries?: (query: string) => Promise<ReadonlySet<string>>;
  /**
   * The fields and values the index holds for this folder (D41).
   *
   * Asked for the folder as a whole rather than for what is currently filtered:
   * the index computes facet values over the entries a query matched, so a
   * narrowed list would drop `mood tired` the moment `mood good` was ticked and
   * leave no way back to it.
   */
  readonly loadFacets?: () => Promise<readonly JournalFacet[]>;
  /**
   * The entries satisfying every active predicate (D43).
   *
   * Arrives with {@link JournalPanelContainerProps.loadFacets}: a menu that can
   * be ticked but changes nothing is worse than no menu.
   */
  readonly matchEntries?: (
    predicates: readonly JournalPredicate[]
  ) => Promise<ReadonlySet<string>>;
  /**
   * The collapsed year and month groups, when something outside remembers them
   * across restarts (D53). Left out, the panel keeps them for its own lifetime,
   * which is what the tests and any host without desktop state get.
   */
  readonly collapsed?: ReadonlySet<string>;
  readonly onCollapsedChange?: (next: ReadonlySet<string>) => void;
  readonly onOpenSettings?: () => void;
  readonly onChooseFolder?: () => void;
  readonly onOpenCalendar: () => void;
}

export function JournalPanelContainer({
  service,
  indexAvailable = false,
  searchEntries,
  loadFacets,
  matchEntries,
  collapsed: controlledCollapsed,
  onCollapsedChange,
  onOpenSettings,
  onChooseFolder,
  onOpenCalendar
}: JournalPanelContainerProps) {
  const [status, setStatus] = useState<JournalStatus>("loading");
  const [listing, setListing] = useState<JournalListing | null>(null);
  const [ownCollapsed, setOwnCollapsed] = useState<ReadonlySet<string>>(new Set());
  const collapsed = controlledCollapsed ?? ownCollapsed;
  const [expandedUndated, setExpandedUndated] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [visibleEntries, setVisibleEntries] = useState<readonly string[]>([]);
  /**
   * First lines already read, kept with the listing they were read from.
   *
   * `null` is a real value here: it records an entry whose first line came back
   * empty or unreadable, so a row that has nothing to show is not asked for
   * again every time a scroll passes over it. Pairing the map with its listing
   * is what drops them when the folder is re-read, without an effect that has
   * to notice and clear.
   */
  const [previewState, setPreviewState] = useState<{
    readonly listing: JournalListing | null;
    readonly previews: ReadonlyMap<string, string | null>;
  }>({ listing: null, previews: new Map() });
  const [search, setSearch] = useState("");
  // A transient action-error banner: shown when a rename/delete/create fails so
  // the user knows why the reload undid their action, then cleared after a
  // pause. Errors used to vanish into `console.error` only.
  const [actionError, setActionError] = useState<string | null>(null);
  const clearActionError = useMemo(() => createDebounced(() => setActionError(null), 6000), []);
  const showActionError = useCallback((message: string): void => {
    setActionError(message);
    clearActionError();
  }, [clearActionError]);
  useEffect(() => () => clearActionError.cancel(), [clearActionError]);
  // The answer is kept with the question it answered, so a result for a query
  // the user has already moved on from is ignored rather than shown as a filter
  // of the new one. Deriving it also keeps the effect from setting state
  // synchronously, which `react-hooks/set-state-in-effect` rightly rejects.
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
  const { selectedDay } = useJournalFilter();

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
  }, [read, reloadToken]);

  // A re-read folder is a different set of files, so what was read from the last
  // one is dropped. Adjusted during render rather than in an effect: an effect
  // would draw one frame of the new listing wearing the old listing's previews.
  if (previewState.listing !== listing) {
    setPreviewState({ listing, previews: new Map() });
  }
  const previews = previewState.previews;

  /**
   * Reads the first line of the entries the panel says are on screen (D9).
   *
   * Scoped to the window rather than to the newest N: the rows must never wait
   * on file reads, and a ten-year journal must never read ten years of files to
   * draw one screen. Reads go out in parallel batches so a screenful does not
   * cost a screenful of sequential round trips.
   */
  useEffect(() => {
    const missing = visibleEntries.filter((path) => !previews.has(path));
    if (missing.length === 0) return;
    let cancelled = false;

    void (async () => {
      const loaded: (readonly [string, string | null])[] = [];
      for (let start = 0; start < missing.length; start += PREVIEW_CONCURRENCY) {
        if (cancelled) return;
        const batch = missing.slice(start, start + PREVIEW_CONCURRENCY);
        loaded.push(
          ...(await Promise.all(
            batch.map(async (path) => [path, await service.readPreview(path)] as const)
          ))
        );
      }
      if (cancelled) return;
      setPreviewState((current) => {
        // The folder was re-read while these were in flight; they describe files
        // from a listing nothing is showing any more.
        if (current.listing !== listing) return current;
        const next = new Map(current.previews);
        for (const [path, preview] of loaded) next.set(path, preview);
        return { listing: current.listing, previews: next };
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [visibleEntries, previews, service, listing]);

  const filtersAvailable =
    indexAvailable && loadFacets !== undefined && matchEntries !== undefined;
  /**
   * The predicates actually in force.
   *
   * Empty while the index cannot answer them: a chip claiming to filter by a
   * value nothing is checking is a lie the user cannot see through. They come
   * back with the index, because the panel never threw them away.
   */
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
  // `null` means no content filter at all, which is not the same as a query
  // that matched nothing — that one has to read as "no matches" (D52). A query
  // still in flight also filters nothing, rather than showing the last one's.
  const searchPaths = searching && matches?.query === query ? matches.paths : null;
  const metadataPaths =
    active.length > 0 && metadataMatches?.of === active ? metadataMatches.paths : null;
  // D16: the search runs inside the filter, not beside it.
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

  const reload = (): void => setReloadToken((token) => token + 1);

  const view = buildJournalView({
    status,
    listing,
    collapsed,
    expandedUndated,
    selectedDay,
    activeFilterCount: (selectedDay ? 1 : 0) + (searchPaths === null ? 0 : 1) + active.length,
    matchingPaths,
    previews
  });

  const toggle = (key: string): void => {
    if (key === "undated") {
      setExpandedUndated(!expandedUndated);
      return;
    }
    const next = new Set(collapsed);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    if (onCollapsedChange) onCollapsedChange(next);
    else setOwnCollapsed(next);
  };

  /** Runs a service call that changes the folder, then refreshes the list. */
  const run = (action: () => Promise<unknown>): void => {
    void action()
      .catch((error: unknown) => {
        // Fail loudly for the developer (console) AND for the user (banner):
        // a reload undoes a failed rename/delete, and without a surface signal
        // the user sees the row reappear and has no idea why their action was
        // undone.
        console.error("[journal] Action failed.", error);
        const detail =
          error instanceof Error && error.message.length > 0
            ? error.message
            : "The folder was reloaded; your change did not take.";
        showActionError(detail);
      })
      // Reload either way: after a failure the panel should show what is
      // actually true now — an unreadable folder, or a list without the entry.
      .finally(reload);
  };

  // Dismissing the day chip clears the calendar's selection in step (D60),
  // because they are one piece of state rather than two that agree.
  const chips: readonly JournalChip[] = [
    ...(selectedDay ? [{ id: "day", label: formatJournalDate(selectedDay) }] : []),
    ...predicateChips(active, facets)
  ];

  const clearFilters = (): void => {
    selectJournalDay(null);
    setPredicates([]);
    // "Clear all" that left the search box filtering would be answering a
    // question the user just withdrew.
    setSearch("");
  };

  return (
    <JournalPanel
      view={view}
      search={search}
      searchAvailable={indexAvailable && searchEntries !== undefined}
      actionError={actionError}
      chips={chips}
      facets={facets}
      predicates={active}
      filtersAvailable={filtersAvailable}
      onToggleFilter={(predicate) =>
        setPredicates((current) => togglePredicate(current, predicate))
      }
      onSearchChange={setSearch}
      onNewEntry={() => run(() => service.createEntry())}
      onToday={() => run(() => service.openToday())}
      onOpenCalendar={onOpenCalendar}
      onOpenEntry={(relativePath) => run(() => service.openEntry(relativePath))}
      onRenameEntry={(relativePath, newRelativePath) => run(() => service.renameEntry(relativePath, newRelativePath))}
      onDeleteEntry={(relativePath) => run(() => service.deleteEntry(relativePath))}
      onVisibleEntriesChange={setVisibleEntries}
      onToggleGroup={toggle}
      onRemoveChip={(id) => {
        if (id === "day") selectJournalDay(null);
        else setPredicates((current) => current.filter((one) => predicateId(one) !== id));
      }}
      onClearFilters={clearFilters}
      onRetry={() => {
        setStatus("loading");
        reload();
      }}
      onChooseFolder={onChooseFolder}
      onOpenSettings={onOpenSettings}
      onCreateFolder={() => run(() => service.createEntry())}
    />
  );
}
