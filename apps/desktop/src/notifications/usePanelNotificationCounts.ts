import { useMemo } from "react";

import { useNotificationStore } from "./notificationStore";

/**
 * Undismissed notifications keyed by the panel they are about.
 *
 * Both chromes surface the same signal differently — the desktop title bar
 * badges each notified panel's icon, the phone bubbles fold them all into the
 * Actions bubble — so the counting rule lives in one place. A notification
 * without a `panel` target counts for nothing here.
 */
export function usePanelNotificationCounts(): ReadonlyMap<string, number> {
  const notifications = useNotificationStore((state) => state.notifications);
  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of notifications) {
      if (item.panel && !item.dismissed) {
        counts.set(item.panel, (counts.get(item.panel) ?? 0) + 1);
      }
    }
    return counts;
  }, [notifications]);
}
