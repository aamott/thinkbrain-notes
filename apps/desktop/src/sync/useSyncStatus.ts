import { useEffect, useState } from "react";

import { subscribeToConflictChanges } from "./conflictService";
import { NOT_RECORDING, type SyncStatus } from "./historyTypes";
import { readSyncStatus, subscribeToSyncStatus } from "./syncService";

/**
 * What this workspace's sync is doing, kept current.
 *
 * One hook for the footer and for the badge over the panel icon, because they
 * are two renderings of one answer — and a window that showed a count in one
 * place and a different one in the other would be worse than showing neither.
 *
 * A failure reads as "not recording" rather than throwing: the footer is an
 * ambient thing, and the panels are where a problem gets explained.
 */
export function useSyncStatus(rootPath: string | null): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>(NOT_RECORDING);

  useEffect(() => {
    if (!rootPath) {
      setStatus(NOT_RECORDING);
      return;
    }
    let cancelled = false;
    const stops: (() => void)[] = [];

    const refresh = () => {
      void readSyncStatus(rootPath)
        .then((next) => {
          if (!cancelled) setStatus(next);
        })
        .catch(() => {
          if (!cancelled) setStatus(NOT_RECORDING);
        });
    };

    refresh();
    // Both halves of "something changed": the sweeper announces what it wrote,
    // and a window settling a conflict announces that too. The count in this
    // status comes from the second and the time from the first.
    for (const subscribe of [subscribeToSyncStatus, subscribeToConflictChanges]) {
      void subscribe(refresh)
        .then((unlisten) => {
          if (cancelled) unlisten();
          else stops.push(unlisten);
        })
        .catch((cause: unknown) => {
          if (!cancelled) console.error("[sync] could not subscribe to status updates", cause);
        });
    }

    return () => {
      cancelled = true;
      for (const stop of stops) stop();
    };
  }, [rootPath]);

  return status;
}
