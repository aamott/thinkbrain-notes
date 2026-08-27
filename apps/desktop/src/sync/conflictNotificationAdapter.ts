/**
 * Conflict → notification adapter.
 *
 * The third producer wired into the notification store. When a cloud daemon
 * drops a copy beside a note, or a git round trip cannot decide an overlapping
 * hunk, the native side records a conflict and fires `sync://conflicts`. The
 * activity-bar badge counts them, but a badge is easy to miss: this adapter
 * says it out loud, once, at the time.
 *
 * This fills the known gap in `pending-merge_ui-high-hard.md` ("No new-conflict
 * toast"), which was blocked on the notification store (Story 1).
 *
 * Design:
 * - **Keyed by copy path, not by count.** `theirs.path` is the handle the
 *   native side names a conflict by. Watching a *count* would stay silent when
 *   one conflict is resolved as another arrives — the total is unchanged, but
 *   something new is waiting. Tracking the set catches that, and matches
 *   `Engine::note_conflicts`, which keys the same way.
 * - **The first read announces**, unlike `settleNotificationAdapter`, whose
 *   first read is a historical counter. Here it is current unresolved state:
 *   the startup reconciliation scan's findings are actionable right now.
 * - **Transient, not sticky.** `pickToast` ranks sticky above transient, so a
 *   sticky conflict would suppress every other producer's toast for as long as
 *   it went unreviewed — which could be days. The badge is the durable
 *   awareness path; this is the announcement.
 * - `source: "sync-conflicts"` — separate from `"sync"` so round-trip cleanup
 *   (`clearBySource("sync")`) does not wipe it.
 *
 * Deliberately not driven by `syncStatus.attention`: that is
 * `conflicts + stuck notes`, and stuck notes are already reported by the sync
 * problem adapter. Announcing them here would say "two versions found" about a
 * file that could not be written.
 */

import { useEffect, useRef } from "react";

import { useNotificationStore } from "../notifications/notificationStore";
import { listConflicts } from "./conflictService";
import type { SyncStatus } from "./historyTypes";

/** Source tag for conflict announcements. */
export const CONFLICT_SOURCE = "sync-conflicts";

/** Props for {@link useConflictNotificationAdapter}. */
export interface ConflictNotificationAdapterProps {
  /** Workspace root path, or null when no workspace is open. */
  readonly rootPath: string | null;
  /** Current sync status — a change is when conflicts may have moved. */
  readonly syncStatus: SyncStatus;
  /** Opens a sync panel, for the notification's Review action. */
  readonly onReview: (panel: "conflicts" | "history") => void;
}

/**
 * Watches the outstanding conflict set and announces newly arrived ones.
 *
 * Mount this once where `rootPath` and the panel opener are both available
 * (`useSyncSurfaces` does). Announces on the first read when the workspace
 * already has conflicts waiting.
 */
export function useConflictNotificationAdapter({
  rootPath,
  syncStatus,
  onReview
}: ConflictNotificationAdapterProps): void {
  const addNotification = useNotificationStore((state) => state.addNotification);
  // The copy paths already announced. Null = no workspace read yet.
  const announced = useRef<ReadonlySet<string> | null>(null);
  // Held in a ref so a caller that rebuilds the callback each render does not
  // re-trigger the read; the effect is about the workspace, not the handler.
  const reviewRef = useRef(onReview);
  // Written in an effect rather than during render: a ref write in the render
  // body is not safe under concurrent rendering, where a render can be thrown
  // away after it has already overwritten the handler.
  useEffect(() => {
    reviewRef.current = onReview;
  }, [onReview]);

  useEffect(() => {
    if (!rootPath) {
      announced.current = null;
      return;
    }
    let cancelled = false;
    void listConflicts(rootPath)
      .then((conflicts) => {
        if (cancelled) return;
        const outstanding = new Set(conflicts.map((conflict) => conflict.theirs.path));
        const seen = announced.current;
        // A resolved conflict leaves the set, so if the same copy comes back
        // later it is new again — which is right, it is waiting again.
        announced.current = outstanding;
        const arrived =
          seen === null
            ? outstanding.size
            : [...outstanding].filter((path) => !seen.has(path)).length;
        if (arrived === 0) return;
        addNotification({
          source: CONFLICT_SOURCE,
          dedupKey: `${CONFLICT_SOURCE}:pending`,
          title: "Two versions found",
          message:
            arrived === 1
              ? "1 note has two versions."
              : `${arrived} notes have two versions.`,
          recovery: "Choose which version to keep, or keep both.",
          severity: "transient",
          variant: "warning",
          action: {
            label: "Review",
            onClick: () => reviewRef.current("conflicts")
          }
        });
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          // A failed read is not worth a notification of its own: the user did
          // not ask, and the panel shows its own error when opened.
          console.debug("[sync] could not read conflicts for announcement", cause);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [rootPath, syncStatus, addNotification]);
}
