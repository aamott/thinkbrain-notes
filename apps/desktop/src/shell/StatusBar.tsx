/**
 * StatusBar — the desktop shell footer.
 *
 * Shows the open workspace, what saving versions is doing, and a notifications
 * bell. The bottom-panel toggle is no longer surfaced here — the panel is
 * opened via the activity bar / command palette / Ctrl+J shortcut.
 *
 * Toasts and the bell log are driven entirely by the notification store
 * (`useNotificationStore`). Sync-specific state used to live here directly
 * (dismissed keys, hover-pause, copy, success toast, error-vs-success
 * priority); it has migrated to the sync adapter
 * (`sync/syncNotificationAdapter.ts`), so this component is now source-agnostic.
 *
 * Toast behavior:
 * - `sticky` notifications never auto-dismiss; only Dismiss or
 *   `clearBySource` clears them.
 * - `transient` notifications auto-dismiss after 8s, paused while hovered.
 * - `silent` notifications never become toasts (the store guarantees this).
 */

import { useEffect, useState } from "react";
import { Bell, Copy, Check } from "lucide-react";
import { cn } from "../lib/utils";
import { SyncPill } from "../sync/SyncPill";
import { useSyncNotificationAdapter } from "../sync/syncNotificationAdapter";
import { NOT_RECORDING, type SyncStatus } from "../sync/historyTypes";
import {
  useActiveToast,
  useNotificationList,
  useUnreadCount
} from "../notifications/useNotifications";
import { useNotificationStore } from "../notifications/notificationStore";
import type { NotificationItem, NotificationVariant } from "../notifications/notificationTypes";

/** Props for the {@link StatusBar} component. */
type StatusBarProps = {
  /** Currently open workspace display name, or null when no workspace is open. */
  readonly workspaceName: string | null;
  /** What this workspace's version saving is doing. */
  readonly syncStatus?: SyncStatus;
  /** Somewhere to go about what the sync pill reports. */
  readonly onOpenSyncPanel?: (panel: "conflicts" | "history") => void;
  readonly onOpenSettings?: () => void;
};

/** Auto-dismiss delay for transient toasts. Sticky toasts ignore this. */
const TRANSIENT_TIMEOUT_MS = 8_000;
/** How long the "Copied" confirmation stays visible. */
const COPIED_TIMEOUT_MS = 2_000;

/** Tailwind border class per variant, mapped to theme tokens. */
function borderForVariant(variant: NotificationVariant | undefined): string {
  switch (variant) {
    case "success":
      return "border-success";
    case "warning":
      return "border-warning";
    case "info":
      return "border-info";
    case "error":
    default:
      return "border-destructive";
  }
}

/** `role` for the toast: `alert` for errors/warnings, `status` otherwise. */
function roleForVariant(variant: NotificationVariant | undefined): "alert" | "status" {
  return variant === "error" || variant === "warning" ? "alert" : "status";
}

/**
 * Desktop shell status bar footer.
 *
 * Layout:
 * - Left: workspace name, then what saving versions is doing.
 * - Spacer.
 * - Far right: notifications bell button opening a small toast popover.
 */
export function StatusBar({
  workspaceName,
  syncStatus,
  onOpenSyncPanel,
  onOpenSettings
}: StatusBarProps) {
  // Wire sync into the notification store. The adapter owns sticky-code
  // mapping and the setup-success toast; this component only reads the store.
  useSyncNotificationAdapter({
    syncStatus: syncStatus ?? NOT_RECORDING,
    onOpenSyncPanel: onOpenSyncPanel ?? noop,
    onOpenSettings: onOpenSettings ?? noop
  });

  const toast = useActiveToast();
  const notifications = useNotificationList();
  const unreadCount = useUnreadCount();
  const dismissNotification = useNotificationStore((state) => state.dismissNotification);
  const clearAll = useNotificationStore((state) => state.clearAll);

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  // Pauses auto-dismiss while the pointer is over the toast, so a long message
  // or technical details can be read without the toast vanishing mid-sentence.
  const [hovering, setHovering] = useState(false);
  // Briefly shows a checkmark after the copy button is pressed.
  const [copied, setCopied] = useState(false);

  const isTransient = toast?.severity === "transient";

  // Auto-dismiss transient toasts after 8s, paused while hovered. Sticky
  // toasts have no timer — only Dismiss or clearBySource clears them.
  useEffect(() => {
    if (!toast || !isTransient || hovering) return;
    const timeout = window.setTimeout(() => {
      if (toast.id) dismissNotification(toast.id);
    }, TRANSIENT_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [toast, isTransient, hovering, dismissNotification]);

  // Clear the "Copied" confirmation shortly after it appears.
  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), COPIED_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  // Bell log: newest-first. Dismissed entries are filtered out so the log
  // shows only what still needs attention.
  const logEntries = notifications.filter((n) => !n.dismissed).reverse();

  return (
    <>
      {toast && (
        <aside
          role={roleForVariant(toast.variant)}
          className={cn(
            "fixed bottom-8 right-3 z-100 w-80 rounded-lg border bg-popover p-3 text-popover-foreground shadow-soft",
            borderForVariant(toast.variant)
          )}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
        >
          <p className="m-0 text-sm font-semibold">{toast.title}</p>
          <p className="mb-0 mt-1 text-xs leading-relaxed">{toast.message}</p>
          {toast.recovery && (
            <p className="mb-0 mt-1 text-xs leading-relaxed text-muted-foreground">{toast.recovery}</p>
          )}
          <Diagnostic details={toast.details} />
          <div className="mt-2 flex gap-2">
            {toast.action && (
              <button
                type="button"
                className="rounded-small border border-border bg-surface px-2 py-1 text-xs"
                onClick={() => toast.action?.onClick()}
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              className="rounded-small px-2 py-1 text-xs text-muted-foreground"
              onClick={() => dismissNotification(toast.id)}
            >
              Dismiss
            </button>
            <button
              type="button"
              className="ml-auto flex items-center gap-1 rounded-small px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              aria-label={copied ? "Copied" : "Copy message"}
              onClick={() => {
                void navigator.clipboard.writeText(notificationText(toast));
                setCopied(true);
              }}
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </aside>
      )}
      <footer className="flex items-center gap-[0.8rem] px-2 bg-statusbar text-statusbar-foreground text-[0.68rem] overflow-hidden whitespace-nowrap">
        <span className="max-[760px]:hidden">{workspaceName ?? "No workspace open"}</span>
        <SyncPill status={syncStatus ?? NOT_RECORDING} onOpen={(panel) => onOpenSyncPanel?.(panel)} />
        <span className="flex-1 max-[760px]:block" />

        <div className="relative">
          <button
            type="button"
            onClick={() => setNotificationsOpen((open) => !open)}
            className={cn(
              "relative flex size-5 items-center justify-center rounded text-inherit hover:bg-accent",
              notificationsOpen && "bg-accent"
            )}
            aria-label="Notifications"
            aria-expanded={notificationsOpen}
          >
            <Bell className="size-3.5" />
            {unreadCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute right-0 top-0 size-1.5 rounded-full bg-danger"
              />
            )}
          </button>

          {notificationsOpen && (
            <>
              {/* Click-away backdrop. */}
              <button
                type="button"
                className="fixed inset-0 z-40 cursor-default"
                aria-hidden="true"
                tabIndex={-1}
                onClick={() => setNotificationsOpen(false)}
              />
              <div
                role="dialog"
                aria-label="Notifications"
                className="absolute bottom-full right-0 mb-2 w-64 rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-soft z-50"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold">Notifications</span>
                  <div className="flex items-center gap-1">
                    {logEntries.length > 0 && (
                      <button
                        type="button"
                        onClick={() => clearAll()}
                        className="rounded-small px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                      >
                        Clear all
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setNotificationsOpen(false)}
                      aria-label="Close notifications"
                      className="flex size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                    >
                      ×
                    </button>
                  </div>
                </div>
                {logEntries.length > 0 ? (
                  <ul className="m-0 flex flex-col gap-2 list-none p-0">
                    {logEntries.map((entry) => (
                      <NotificationRow
                        key={entry.id}
                        entry={entry}
                        copied={copied}
                        onCopied={() => setCopied(true)}
                        onDismiss={() => dismissNotification(entry.id)}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="m-0 text-xs text-muted-foreground">No notifications</p>
                )}
              </div>
            </>
          )}
        </div>
      </footer>
    </>
  );
}

/** One row in the bell log. */
function NotificationRow({
  entry,
  copied,
  onCopied,
  onDismiss
}: {
  readonly entry: NotificationItem;
  readonly copied: boolean;
  readonly onCopied: () => void;
  readonly onDismiss: () => void;
}) {
  return (
    <li className="flex flex-col gap-1 text-xs">
      <span className="font-semibold">{entry.title}</span>
      <span>{entry.message}</span>
      {entry.recovery && <span className="text-muted-foreground">{entry.recovery}</span>}
      <Diagnostic details={entry.details} />
      <div className="mt-1 flex items-center gap-2">
        {entry.action && (
          <button
            type="button"
            className="rounded-small border border-border bg-surface px-2 py-1 text-xs"
            onClick={() => entry.action?.onClick()}
          >
            {entry.action.label}
          </button>
        )}
        <button
          type="button"
          className="rounded-small px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={onDismiss}
        >
          Dismiss
        </button>
        <button
          type="button"
          className="ml-auto flex items-center gap-1 rounded-small px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          aria-label={copied ? "Copied" : "Copy message"}
          onClick={() => {
            void navigator.clipboard.writeText(notificationText(entry));
            onCopied();
          }}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </li>
  );
}

function Diagnostic({ details }: { readonly details?: string }) {
  if (!details) return null;
  return (
    <details className="mt-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer">Technical details</summary>
      <p className="mb-0 mt-1 break-words font-mono">{details}</p>
    </details>
  );
}

/**
 * Composes the full notification text for copying — title, message, recovery,
 * and any technical details — so a user can paste a complete report in one
 * click. Source-agnostic: works for any notification, not just sync.
 */
function notificationText(item: NotificationItem): string {
  const lines = [item.title, item.message];
  if (item.recovery) lines.push(item.recovery);
  if (item.details) lines.push(`Technical details: ${item.details}`);
  return lines.filter(Boolean).join("\n");
}

function noop(): void {
  /* no-op default for optional callbacks */
}
