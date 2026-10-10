import { useCallback, useEffect, useMemo, useState } from "react";

import type { EventSubscriber } from "@thinkbrain/core";
import type { AppEvents } from "../events/appEvents";
import { createDebounced } from "../lib/debounce";
import { JournalPanel } from "./JournalPanel";
import { useJournalListRefresh } from "./journalChrome";
import {
  predicateChips,
  predicateId,
  togglePredicate,
  type JournalChip,
  type JournalFacet,
  type JournalPredicate
} from "./journalFacets";
import { selectJournalDay, useJournalFilter } from "./journalFilterStore";
import { buildJournalView } from "./journalViewModel";
import { formatJournalDate } from "@thinkbrain/core";
import { type JournalListing, type JournalService } from "./journalService";
import { useJournalEntriesQuery } from "./useJournalEntriesQuery";

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

export interface JournalPanelContainerProps {
  readonly service: JournalService;
  /**
   * What the listing is of — workspace root plus journal folder. A
   * kept-mounted panel has no remount to notice a vault switch or a `root`
   * setting change, so both arrive through this key and re-read the folder.
   */
  readonly listKey?: string;
  /**
   * The extension's event surface (`context.events`), so its subscriptions
   * are scoped to the activation rather than the app-wide bus.
   */
  readonly events: EventSubscriber<AppEvents>;
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
  listKey = "",
  events,
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
  const {
    status,
    listing,
    reload,
    retry,
    search,
    setSearch,
    searchAvailable,
    filtersAvailable,
    facets,
    active,
    setPredicates,
    searchPaths,
    matchingPaths
  } = useJournalEntriesQuery({
    service,
    listKey,
    indexAvailable,
    searchEntries,
    loadFacets,
    matchEntries
  });
  const [ownCollapsed, setOwnCollapsed] = useState<ReadonlySet<string>>(new Set());
  const collapsed = controlledCollapsed ?? ownCollapsed;
  const [expandedUndated, setExpandedUndated] = useState(false);
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
  const { selectedDay } = useJournalFilter();

  // A re-read folder is a different set of files, so what was read from the last
  // one is dropped. Adjusted during render rather than in an effect: an effect
  // would draw one frame of the new listing wearing the old listing's previews.
  if (previewState.listing !== listing) {
    setPreviewState({ listing, previews: new Map() });
  }
  const previews = previewState.previews;

  // The panel is kept mounted, so nothing remounts it into freshness: the
  // listing follows the folder changes every surface announces (D68).
  useJournalListRefresh(reload, events);

  // A save can change the one thing the listing borrows from file contents:
  // the preview. Drop just that path so the visible window refetches it.
  useEffect(() => {
    const subscription = events.on("note.saved", ({ relativePath }) => {
      setPreviewState((current) => {
        if (!current.previews.has(relativePath)) return current;
        const previews = new Map(current.previews);
        previews.delete(relativePath);
        return { listing: current.listing, previews };
      });
    });
    return () => void subscription.dispose();
  }, [events]);

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
      searchAvailable={searchAvailable}
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
      onRetry={retry}
      onChooseFolder={onChooseFolder}
      onOpenSettings={onOpenSettings}
      onCreateFolder={() => run(() => service.createEntry())}
    />
  );
}
