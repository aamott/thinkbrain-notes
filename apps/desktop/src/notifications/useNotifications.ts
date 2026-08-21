/**
 * Selectors over the notification store.
 *
 * Exported separately from the store so consumers depend on the read surface,
 * not the action surface, and so the store module can be reset in tests
 * without dragging UI imports along.
 */

import { useNotificationStore } from "./notificationStore";
import type { NotificationItem } from "./notificationTypes";

/** The notification currently shown as a toast, or null. */
export function useActiveToast(): NotificationItem | null {
  return useNotificationStore((state) => state.activeToast);
}

/** All notifications, oldest-first (the bell renders them reversed). */
export function useNotificationList(): readonly NotificationItem[] {
  return useNotificationStore((state) => state.notifications);
}

/** Count of undismissed notifications — drives the bell badge dot. */
export function useUnreadCount(): number {
  return useNotificationStore((state) =>
    state.notifications.reduce((count, n) => (n.dismissed ? count : count + 1), 0)
  );
}
