/**
 * Everything the shell needs to show about sync, in one call.
 *
 * The shell wants three things from sync that all derive from one status read:
 * the footer's state, the badge over the conflicts panel icon, and the
 * announcements that go to the notification store. Keeping them together means
 * the count in the badge and the count in the footer cannot disagree, and it
 * gives each new producer a home outside `DesktopShell`, which is at the size
 * limit and grew partly by accumulating exactly this kind of wiring.
 *
 * The status is read here rather than inside the conflicts panel: the number
 * has to be visible to someone who has never opened it, which is exactly when
 * the panel is not mounted to count anything.
 */

import { useMemo } from "react";

import { useConflictNotificationAdapter } from "./conflictNotificationAdapter";
import type { SyncStatus } from "./historyTypes";
import { useSettleNotificationAdapter } from "./settleNotificationAdapter";
import { useSyncStatus } from "./useSyncStatus";

/** Props for {@link useSyncSurfaces}. */
export interface SyncSurfacesProps {
  /** Workspace root path, or null when no workspace is open. */
  readonly rootPath: string | null;
  /** Opens a sync panel, for notification action buttons. */
  readonly onReview: (panel: "conflicts" | "history") => void;
}

/** What the shell renders from sync. */
export interface SyncSurfaces {
  readonly syncStatus: SyncStatus;
  /** Activity-bar badge counts, keyed by panel id. */
  readonly conflictBadges: Readonly<Record<string, number>>;
}

/**
 * Reads sync status, mounts the notification producers, derives the badge.
 *
 * Mount once, in the shell. The badge counts everything needing attention —
 * conflicts and notes that could not be written — because that is what the
 * icon is asking the user to go and look at.
 */
export function useSyncSurfaces({ rootPath, onReview }: SyncSurfacesProps): SyncSurfaces {
  const syncStatus = useSyncStatus(rootPath);
  useSettleNotificationAdapter({ rootPath, syncStatus });
  useConflictNotificationAdapter({ rootPath, syncStatus, onReview });

  const conflictBadges = useMemo<Readonly<Record<string, number>>>(() => {
    const badges: Record<string, number> = {};
    if (syncStatus.attention > 0) badges.conflicts = syncStatus.attention;
    return badges;
  }, [syncStatus.attention]);

  return { syncStatus, conflictBadges };
}
