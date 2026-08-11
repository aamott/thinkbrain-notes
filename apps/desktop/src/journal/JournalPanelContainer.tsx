import { useCallback, useEffect, useState } from "react";

import { JournalPanel, type JournalChip } from "./JournalPanel";
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

/** How many entries get a preview before virtualization exists to scope it. */
const PREVIEW_LIMIT = 60;

/** A pause long enough to mean "done typing", short enough not to feel laggy. */
const SEARCH_DEBOUNCE_MS = 200;

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
  readonly onOpenSettings?: () => void;
  readonly onChooseFolder?: () => void;
  readonly onOpenCalendar: () => void;
}

export function JournalPanelContainer({
  service,
  indexAvailable = false,
  searchEntries,
  onOpenSettings,
  onChooseFolder,
  onOpenCalendar
}: JournalPanelContainerProps) {
  const [status, setStatus] = useState<JournalStatus>("loading");
  const [listing, setListing] = useState<JournalListing | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [expandedUndated, setExpandedUndated] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [previews, setPreviews] = useState<ReadonlyMap<string, string>>(new Map());
  const [search, setSearch] = useState("");
  // The answer is kept with the question it answered, so a result for a query
  // the user has already moved on from is ignored rather than shown as a filter
  // of the new one. Deriving it also keeps the effect from setting state
  // synchronously, which `react-hooks/set-state-in-effect` rightly rejects.
  const [matches, setMatches] = useState<{
    readonly query: string;
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

  // First lines are read after the list is on screen, newest first and capped:
  // the rows must never wait on file reads, and a ten-year journal must never
  // read ten years of files to draw one screen. Reads are batched in parallel
  // (capped to avoid flooding the IPC bridge) so 60 previews don't take 60
  // sequential round-trips.
  useEffect(() => {
    if (!listing) return;
    let cancelled = false;
    const wanted = listing.entries
      .slice(-PREVIEW_LIMIT)
      .reverse()
      .map((entry) => entry.relativePath);

    void (async () => {
      const CONCURRENCY = 8;
      const loaded = new Map<string, string>();
      for (let i = 0; i < wanted.length; i += CONCURRENCY) {
        if (cancelled) return;
        const batch = wanted.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          batch.map(async (path) => [path, await service.readPreview(path)] as const)
        );
        if (cancelled) return;
        for (const [path, preview] of results) {
          if (preview !== null) loaded.set(path, preview);
        }
      }
      if (!cancelled) setPreviews(loaded);
    })();

    return () => {
      cancelled = true;
    };
  }, [listing, service]);

  const query = search.trim();
  const searching = indexAvailable && searchEntries !== undefined && query !== "";
  // `null` means no content filter at all, which is not the same as a query
  // that matched nothing — that one has to read as "no matches" (D52). A query
  // still in flight also filters nothing, rather than showing the last one's.
  const matchingPaths =
    searching && matches?.query === query ? matches.paths : null;

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
    activeFilterCount: (selectedDay ? 1 : 0) + (matchingPaths === null ? 0 : 1),
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
    setCollapsed(next);
  };

  /** Runs a service call that changes the folder, then refreshes the list. */
  const run = (action: () => Promise<unknown>): void => {
    void action()
      .catch((error: unknown) => {
        console.error("[journal] Action failed.", error);
      })
      // Reload either way: after a failure the panel should show what is
      // actually true now — an unreadable folder, or a list without the entry.
      .finally(reload);
  };

  // Dismissing the day chip clears the calendar's selection in step (D60),
  // because they are one piece of state rather than two that agree.
  const chips: readonly JournalChip[] = selectedDay
    ? [{ id: "day", label: formatJournalDate(selectedDay) }]
    : [];

  return (
    <JournalPanel
      view={view}
      search={search}
      searchAvailable={indexAvailable && searchEntries !== undefined}
      // Facets need frontmatter in the index, which is its own story; the
      // full-text index landing does not make them available.
      facetsAvailable={false}
      chips={chips}
      onSearchChange={setSearch}
      onNewEntry={() => run(() => service.createEntry())}
      onToday={() => run(() => service.openToday())}
      onOpenCalendar={onOpenCalendar}
      onOpenEntry={(relativePath) => run(() => service.openEntry(relativePath))}
      onRenameEntry={(relativePath, newRelativePath) => run(() => service.renameEntry(relativePath, newRelativePath))}
      onDeleteEntry={(relativePath) => run(() => service.deleteEntry(relativePath))}
      onToggleGroup={toggle}
      onRemoveChip={() => selectJournalDay(null)}
      onClearFilters={() => selectJournalDay(null)}
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
