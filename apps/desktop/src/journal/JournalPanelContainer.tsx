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

export interface JournalPanelContainerProps {
  readonly service: JournalService;
  /** False until the platform index exists; disables search and facets (D41). */
  readonly indexAvailable?: boolean;
  readonly onOpenSettings?: () => void;
  readonly onChooseFolder?: () => void;
  readonly onOpenCalendar: () => void;
}

export function JournalPanelContainer({
  service,
  indexAvailable = false,
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

  const reload = (): void => setReloadToken((token) => token + 1);

  const view = buildJournalView({
    status,
    listing,
    collapsed,
    expandedUndated,
    selectedDay,
    activeFilterCount: selectedDay ? 1 : 0,
    matchingPaths: null,
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
      search=""
      searchAvailable={indexAvailable}
      facetsAvailable={indexAvailable}
      chips={chips}
      onSearchChange={() => undefined}
      onNewEntry={() => run(() => service.createEntry())}
      onToday={() => run(() => service.openToday())}
      onOpenCalendar={onOpenCalendar}
      onOpenEntry={(relativePath) => run(() => service.openEntry(relativePath))}
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
