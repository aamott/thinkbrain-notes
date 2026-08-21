/**
 * Zustand store for source-agnostic notifications.
 *
 * Owns the in-memory notification log and the currently visible toast. The
 * store is intentionally thin: producers (sync adapter, future extension
 * adapters) push items in via `addNotification`, and the StatusBar reads
 * `activeToast` / `notifications` / `unreadCount` via the selectors in
 * `useNotifications.ts`.
 *
 * Dedup by `dedupKey`: a recurring problem updates the existing entry in
 * place (refreshing message/details/timestamp and un-dismissing it) rather
 * than appending a new row, so the log does not fill with repeats. Items
 * without a `dedupKey` are always appended.
 *
 * Ephemeral by design — nothing here is persisted across sessions, so a
 * restart starts with an empty log.
 */

import { create } from "zustand";
import type { NotificationInput, NotificationItem } from "./notificationTypes";

/** State + actions exposed by the notification store. */
export interface NotificationStoreState {
  /** All notifications, oldest-first. Dismissed entries remain here. */
  readonly notifications: readonly NotificationItem[];
  /** The notification currently shown as a toast, or null when none. */
  readonly activeToast: NotificationItem | null;

  /**
   * Adds (or, when `dedupKey` matches, updates) a notification.
   *
   * Updating an existing entry refreshes its message/details/action/variant,
   * bumps `createdAt`, un-dismisses it, and re-promotes it to the toast if
   * its severity is not `silent`. Returns the assigned id.
   */
  addNotification(input: NotificationInput): string;
  /** Marks a notification dismissed and clears the toast if it was active. */
  dismissNotification(id: string): void;
  /** Dismisses every notification and clears the toast. */
  clearAll(): void;
  /** Removes every notification from `source` and clears the toast if needed. */
  clearBySource(source: string): void;
}

let idCounter = 0;
/** Monotonic id, scoped to this module so a restart starts fresh. */
function nextId(): string {
  idCounter += 1;
  return `n-${idCounter}`;
}

/**
 * Picks the toast: the highest-priority non-dismissed, non-silent notification.
 *
 * Priority is `sticky` over `transient` — a sticky notification needs user
 * action and should not be bumped aside by a transient success that will
 * auto-dismiss anyway. Among the same severity, the most recent wins.
 *
 * Computed on each add/dismiss/clear so consumers can read `activeToast`
 * directly without re-deriving it. Silent items only appear in the log.
 */
function pickToast(notifications: readonly NotificationItem[]): NotificationItem | null {
  let best: NotificationItem | null = null;
  for (let i = notifications.length - 1; i >= 0; i -= 1) {
    const item = notifications[i];
    if (!item || item.dismissed || item.severity === "silent") continue;
    if (best === null) {
      best = item;
      continue;
    }
    // Sticky wins over transient. Same severity: the first one we hit walking
    // from the end is the most recent, so keep it.
    if (item.severity === "sticky" && best.severity !== "sticky") {
      best = item;
    }
  }
  return best;
}

export const useNotificationStore = create<NotificationStoreState>((set, get) => ({
  notifications: [],
  activeToast: null,

  addNotification(input) {
    const id = nextId();
    const createdAt = Date.now();
    const item: NotificationItem = { ...input, id, createdAt, dismissed: false };
    const existing =
      input.dedupKey === undefined
        ? null
        : get().notifications.find((n) => n.dedupKey === input.dedupKey) ?? null;

    let notifications: readonly NotificationItem[];
    if (existing) {
      // Update in place: refresh mutable fields, un-dismiss, keep the id so
      // dismiss/clear references stay valid. Re-append to the end so it is
      // newest-first in the log.
      const updated: NotificationItem = {
        ...existing,
        title: input.title,
        message: input.message,
        recovery: input.recovery,
        details: input.details,
        action: input.action,
        variant: input.variant,
        severity: input.severity,
        createdAt,
        dismissed: false
      };
      notifications = get()
        .notifications.filter((n) => n.id !== existing.id)
        .concat(updated);
    } else {
      notifications = get().notifications.concat(item);
    }
    set({ notifications, activeToast: pickToast(notifications) });
    return existing?.id ?? id;
  },

  dismissNotification(id) {
    const notifications = get().notifications.map((n) =>
      n.id === id ? { ...n, dismissed: true } : n
    );
    set({ notifications, activeToast: pickToast(notifications) });
  },

  clearAll() {
    set({ notifications: [], activeToast: null });
  },

  clearBySource(source) {
    const notifications = get().notifications.filter((n) => n.source !== source);
    set({ notifications, activeToast: pickToast(notifications) });
  }
}));

/** Reset the store to its initial empty state. Intended for tests. */
export function resetNotificationStore(): void {
  idCounter = 0;
  useNotificationStore.setState({ notifications: [], activeToast: null });
}
