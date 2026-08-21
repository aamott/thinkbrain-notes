/**
 * Source-agnostic notification shapes.
 *
 * A notification is anything a surface (toast, bell log) might want to show,
 * regardless of who raised it. The first producer is sync; extensions,
 * updates, and ACP will follow. Adding a producer only requires a new adapter
 * that calls `addNotification` — the store and UI do not change.
 *
 * `severity` replaces a boolean "sticky" flag because three states are real:
 * - `silent`   — logged to the bell only, no toast.
 * - `transient`— toasts with an 8s auto-dismiss (hover-paused), then logs.
 * - `sticky`   — toasts until the user dismisses or the source clears it.
 *
 * `dedupKey` lets a recurring problem update an existing entry in place rather
 * than filling the log. `action` carries a per-notification button (e.g.,
 * "Open saved versions"). `variant` drives the toast/bell row color.
 */

/** How loudly a notification should be surfaced. */
export type NotificationSeverity = "silent" | "transient" | "sticky";

/** Visual tone, mapped to theme tokens (success/warning/destructive/info). */
export type NotificationVariant = "error" | "warning" | "info" | "success";

/** A button a user can press in response to a notification. */
export interface NotificationAction {
  readonly label: string;
  readonly onClick: () => void;
}

/** One notification, raised by some source, awaiting dismissal or action. */
export interface NotificationItem {
  /** Stable unique id, assigned by the store. */
  readonly id: string;
  /** Who raised this — "sync", "extension:<id>", "update", etc. */
  readonly source: string;
  /**
   * Optional dedup key. When set, re-adding a notification with the same key
   * updates the existing entry in place (refreshing message/details and
   * un-dismissing it) rather than creating a new row.
   */
  readonly dedupKey?: string;
  readonly title: string;
  readonly message: string;
  /** Something to do about it, shown under the message. */
  readonly recovery?: string;
  /** Sanitized diagnostic, shown behind a disclosure. */
  readonly details?: string;
  /** Optional action button (e.g., "Open saved versions"). */
  readonly action?: NotificationAction;
  readonly severity: NotificationSeverity;
  /** Visual tone. Defaults to `error` when omitted for backward compat. */
  readonly variant?: NotificationVariant;
  /** Milliseconds since the epoch. */
  readonly createdAt: number;
  /** True once the user has dismissed this entry. */
  readonly dismissed?: boolean;
}

/** Input passed to `addNotification` — the store assigns `id` and `createdAt`. */
export type NotificationInput = Omit<NotificationItem, "id" | "createdAt" | "dismissed">;
