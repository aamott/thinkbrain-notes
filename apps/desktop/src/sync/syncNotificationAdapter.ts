/**
 * Sync → notification adapter.
 *
 * The first producer wired into the notification store. Watches the
 * workspace's `SyncStatus` and the `sync://setup` event, and pushes/clears
 * notifications with `source: "sync"`. The StatusBar no longer knows about
 * sync-specific problem codes, success toasts, or `subscribeToSetupSuccess` —
 * it only reads the store.
 *
 * Severity is derived from the error code: codes that require user action
 * before the next round trip can succeed are `sticky`; everything else is
 * `transient`. The sticky-code list lives here, not in the store, because it
 * is sync's concern alone.
 *
 * On a status with no problem and no maintenance problem, all sync entries
 * are cleared (`clearBySource("sync")`) — a successful round trip dismisses
 * the toast and removes the log rows. Other sources are untouched, and
 * dismissed entries stay dismissed (they are removed, not re-raised).
 */

import { useEffect } from "react";

import { useNotificationStore } from "../notifications/notificationStore";
import type {
  NotificationAction,
  NotificationInput,
  NotificationVariant
} from "../notifications/notificationTypes";
import { recoveryFor } from "./syncCopy";
import { subscribeToSetupSuccess } from "./syncService";
import type { SyncProblem, SyncStatus } from "./historyTypes";

/** Source tag for sync problem notifications (cleared on a clean round trip). */
export const SYNC_SOURCE = "sync";

/**
 * Source tag for the setup-success toast.
 *
 * Separate from {@link SYNC_SOURCE} so that `clearBySource("sync")` — fired
 * when sync status becomes clean — does not wipe the success toast before its
 * 8s transient timer runs. Saving credentials fires both `sync://setup` and
 * `sync://status` in quick succession; the status refresh shows no problem
 * and would clear the success notification if it shared the `sync` source.
 */
const SYNC_SETUP_SOURCE = "sync-setup";

/**
 * Sync error codes that require user action before the next round trip can
 * succeed. These surface as `sticky` toasts — they do not auto-dismiss.
 *
 * Every other code is `transient`: it may clear on retry, so an 8s toast is
 * enough and the log entry is removed when sync next succeeds.
 */
export const STICKY_SYNC_CODES: ReadonlySet<string> = new Set([
  "sync.auth_required",
  "sync.credentials_need_https",
  "sync.credentials_invalid",
  "sync.credentials_forbidden",
  "sync.credentials_unavailable",
  "sync.credentials_username_missing",
  "sync.credentials_token_missing",
  "sync.remote_not_found",
  "sync.vault_too_deep",
  "sync.vault_too_many_entries"
]);

/** Maintenance tidy failures get their own title and route to Settings. */
const HISTORY_CLEANUP_FAILED = "sync.history_cleanup_failed";

/** Props for {@link useSyncNotificationAdapter}. */
export interface SyncNotificationAdapterProps {
  /** Current workspace sync status, as read by `useSyncStatus`. */
  readonly syncStatus: SyncStatus;
  /** Opens the sync history/conflicts panel — the recovery action for ordinary problems. */
  readonly onOpenSyncPanel: (panel: "conflicts" | "history") => void;
  /** Opens Settings — the recovery action for maintenance failures. */
  readonly onOpenSettings: () => void;
}

/**
 * Wires sync status and setup-success into the notification store.
 *
 * Mount this once near the StatusBar (the DesktopShell does). It is
 * idempotent across React strict-mode double-mount: the effect cleanup
 * unsubscribes the setup listener, and the status-driven push/clear is
 * purely a function of the latest `syncStatus`.
 */
export function useSyncNotificationAdapter({
  syncStatus,
  onOpenSyncPanel,
  onOpenSettings
}: SyncNotificationAdapterProps): void {
  const addNotification = useNotificationStore((state) => state.addNotification);
  const clearBySource = useNotificationStore((state) => state.clearBySource);

  // Push/clear sync notifications whenever the status changes. Derived purely
  // from `syncStatus`, so re-renders are idempotent — the store dedupes by
  // `dedupKey`, so re-pushing the same problem is a no-op update.
  useEffect(() => {
    const problem = syncStatus.problem ?? syncStatus.maintenanceProblem;
    if (!problem) {
      clearBySource(SYNC_SOURCE);
      return;
    }
    addNotification(problemToNotification(problem, onOpenSyncPanel, onOpenSettings));
  }, [syncStatus, addNotification, clearBySource, onOpenSyncPanel, onOpenSettings]);

  // Migrate the setup-success toast: a transient success notification, not a
  // sync-specific state machine in the StatusBar.
  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;
    void subscribeToSetupSuccess(() => {
      if (cancelled) return;
      addNotification({
        source: SYNC_SETUP_SOURCE,
        dedupKey: `${SYNC_SETUP_SOURCE}:setup-success`,
        title: "Git link is ready",
        message: "Notes can now stay in step with this git link.",
        severity: "transient",
        variant: "success"
      });
    })
      .then((unlisten) => {
        if (cancelled) unlisten();
        else stop = unlisten;
      })
      .catch((cause: unknown) => {
        if (!cancelled) console.error("[sync] could not subscribe to setup success", cause);
      });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [addNotification]);
}

/**
 * Maps a `SyncProblem` to a `NotificationInput` with `source: "sync"`.
 *
 * Exported for the adapter's unit tests; not part of the public surface.
 */
export function problemToNotification(
  problem: SyncProblem,
  onOpenSyncPanel: (panel: "conflicts" | "history") => void,
  onOpenSettings: () => void
): NotificationInput {
  const isMaintenance = problem.code === HISTORY_CLEANUP_FAILED;
  const sticky = STICKY_SYNC_CODES.has(problem.code);
  const severity = sticky ? "sticky" : "transient";
  const variant: NotificationVariant = "error";
  const title = isMaintenance ? "Could not free space" : "Sync needs attention";
  const action: NotificationAction = isMaintenance
    ? { label: "Open Settings", onClick: onOpenSettings }
    : { label: "Open saved versions", onClick: () => onOpenSyncPanel("history") };

  return {
    source: SYNC_SOURCE,
    dedupKey: `${SYNC_SOURCE}:${problem.code}`,
    title,
    message: problem.message,
    recovery: recoveryFor(problem.code),
    details: problem.details,
    action,
    severity,
    variant
  };
}
