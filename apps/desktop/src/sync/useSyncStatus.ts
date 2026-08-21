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
 *
 * Optional callbacks share this hook's listeners with panels that also need
 * to refresh their own content.
 */
export function useSyncStatus(
  rootPath: string | null,
  onConflictChange?: () => void,
  onStatusChange?: () => void
): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>(NOT_RECORDING);

  useEffect(() => {
    if (!rootPath) {
      setStatus(NOT_RECORDING);
      return;
    }
    let cancelled = false;
    const stops: (() => void)[] = [];

    const refresh = () => {
      onStatusChange?.();
      void readSyncStatus(rootPath)
        .then((next) => {
          if (!cancelled) setStatus(next);
        })
        .catch(() => {
          if (!cancelled) setStatus(NOT_RECORDING);
        });
    };
    const refreshConflictStatus = () => {
      if (cancelled) return;
      refresh();
      onConflictChange?.();
    };

    refresh();
    void subscribeToSyncStatus(refresh)
      .then((unlisten) => {
        if (cancelled) unlisten();
        else stops.push(unlisten);
      })
      .catch((cause: unknown) => {
        if (!cancelled) console.error("[sync] could not subscribe to status updates", cause);
      });
    void subscribeToConflictChanges(refreshConflictStatus)
      .then((unlisten) => {
        if (cancelled) unlisten();
        else stops.push(unlisten);
      })
      .catch((cause: unknown) => {
        if (!cancelled) console.error("[sync] could not subscribe to status updates", cause);
      });

    return () => {
      cancelled = true;
      for (const stop of stops) stop();
    };
  }, [onConflictChange, onStatusChange, rootPath]);

  return status;
}
