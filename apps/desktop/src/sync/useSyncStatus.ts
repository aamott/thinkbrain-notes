import { useEffect, useState } from "react";

import { subscribeToConflictChanges } from "./conflictService";
import { NOT_RECORDING, type SyncStatus } from "./historyTypes";
import { readSyncStatus, subscribeToSyncStatus } from "./syncService";

/** A status and the workspace it was read from. */
interface StatusReading {
  readonly rootPath: string | null;
  readonly status: SyncStatus;
}

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
  // Keyed by the workspace it describes, so leaving one workspace does not
  // need an effect to write the reset back into state — a status that is not
  // this root's simply is not shown. Resetting from inside the effect cost a
  // second render pass on every workspace change.
  const [reading, setReading] = useState<StatusReading>({ rootPath: null, status: NOT_RECORDING });

  useEffect(() => {
    if (!rootPath) return;
    let cancelled = false;
    const stops: (() => void)[] = [];

    const refresh = () => {
      onStatusChange?.();
      void readSyncStatus(rootPath)
        .then((next) => {
          if (!cancelled) setReading({ rootPath, status: next });
        })
        .catch(() => {
          if (!cancelled) setReading({ rootPath, status: NOT_RECORDING });
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

  return reading.rootPath === rootPath ? reading.status : NOT_RECORDING;
}
