import { useCallback, useEffect, useState } from "react";

import { JournalPanel, type JournalChip } from "./JournalPanel";
import { buildJournalView, type JournalStatus } from "./journalViewModel";
import { JournalError, type JournalListing, type JournalService } from "./journalService";

/**
 * Holds the popout's state and drives the service.
 *
 * Split from {@link JournalPanel} so the panel stays presentational: every one
 * of its fourteen states is reachable in a test without a workspace, and this
 * file owns the parts that need one.
 */

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

  const reload = (): void => setReloadToken((token) => token + 1);

  const view = buildJournalView({
    status,
    listing,
    collapsed,
    expandedUndated,
    selectedDay: null,
    activeFilterCount: 0,
    matchingPaths: null,
    previews: new Map()
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

  const chips: readonly JournalChip[] = [];

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
      onRemoveChip={() => undefined}
      onClearFilters={() => undefined}
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
