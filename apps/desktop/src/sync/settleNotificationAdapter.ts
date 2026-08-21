/**
 * Settle → notification adapter.
 *
 * The second producer wired into the notification store. When the sync
 * engine's sweeper settles obvious conflicts (byte-identical copies or
 * copies matching a recorded version), the `settled` counter in
 * `ConflictRate` increases. This adapter watches that counter and pushes a
 * transient notification — "N duplicates were tidied away without asking" —
 * so the user hears it at the time, not only later in the History panel's
 * footer.
 *
 * This fills the known gap noted in `done-settle_obvious_conflicts-med-med.md`:
 * settling was recorded and counted but never announced. The notification
 * store (Story 1) unblocked it.
 *
 * Design:
 * - Reads `readConflictRate` on mount and whenever `syncStatus` changes
 *   (status changes after a round trip, which is when settling happens).
 * - Tracks the previous `settled` count in a ref; only *increases* notify,
 *   so the initial read and decreases (history pruning) stay silent.
 * - `source: "sync-settle"` — separate from `"sync"` so round-trip cleanup
 *   (`clearBySource("sync")`) does not wipe it. Settle notifications are
 *   transient (8s toast) and need no cleanup: they are one-shot announcements.
 */

import { useEffect, useRef } from "react";

import { useNotificationStore } from "../notifications/notificationStore";
import { readConflictRate } from "./syncService";
import type { SyncStatus } from "./historyTypes";

/** Source tag for settle announcements. */
export const SETTLE_SOURCE = "sync-settle";

/** Props for {@link useSettleNotificationAdapter}. */
export interface SettleNotificationAdapterProps {
  /** Workspace root path, or null when no workspace is open. */
  readonly rootPath: string | null;
  /** Current sync status — re-reading the conflict rate on changes catches
   *  settlements that happened during a round trip. */
  readonly syncStatus: SyncStatus;
}

/**
 * Watches the conflict-rate `settled` counter and announces increases.
 *
 * Mount this once near the StatusBar (the DesktopShell does, where `rootPath`
 * is available). Silent on the initial read; only subsequent increases push
 * a transient notification.
 */
export function useSettleNotificationAdapter({
  rootPath,
  syncStatus
}: SettleNotificationAdapterProps): void {
  const addNotification = useNotificationStore((state) => state.addNotification);
  // Tracks the last seen `settled` count. Null = "haven't read yet" so the
  // first read establishes a baseline without notifying.
  const prevSettled = useRef<number | null>(null);

  useEffect(() => {
    if (!rootPath) {
      prevSettled.current = null;
      return;
    }
    let cancelled = false;
    void readConflictRate(rootPath)
      .then((rate) => {
        if (cancelled) return;
        const before = prevSettled.current;
        prevSettled.current = rate.settled;
        // Only announce increases — the initial read sets the baseline,
        // and decreases (history pruning) are not announcements.
        if (before !== null && rate.settled > before) {
          const newlySettled = rate.settled - before;
          addNotification({
            source: SETTLE_SOURCE,
            dedupKey: `${SETTLE_SOURCE}:announced`,
            title: "Duplicates tidied away",
            message:
              newlySettled === 1
                ? "1 duplicate copy was handled without asking."
                : `${newlySettled} duplicate copies were handled without asking.`,
            recovery: "Nothing is lost — each one is restorable from the saved versions.",
            severity: "transient",
            variant: "info"
          });
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          // A failed rate read is not worth a notification: the user did not
          // ask, and the History panel will show its own error if opened.
          console.debug("[sync] could not read conflict rate for settle announcement", cause);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [rootPath, syncStatus, addNotification]);
}
