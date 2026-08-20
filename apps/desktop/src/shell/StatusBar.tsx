/**
 * StatusBar — the desktop shell footer.
 *
 * Extracted from DesktopShell.tsx as part of the "Desktop Shell Composition"
 * story (plans/ui-shell/pending-desktop_shell_composition-high-hard.md).
 *
 * Shows the open workspace, what saving versions is doing, and a notifications
 * bell. The bottom-panel toggle is no longer surfaced here — the panel is
 * opened via the activity bar / command palette / Ctrl+J shortcut.
 *
 * It used to carry counters, an indexer state, a cursor position, an
 * indentation and an encoding, none of which were read from anything: `✓ 0 ⚠ 0`
 * was the literal string, `Ln —, Col —` had no editor behind it, and "Indexer
 * unavailable" was untrue by the time search shipped. A footer that reports
 * things it cannot know teaches people to stop reading it, which is a bad habit
 * to have taught them by the time it says saving has stopped.
 */

import { useEffect, useState } from "react";
import { Bell, Copy, Check } from "lucide-react";
import { cn } from "../lib/utils";
import { SyncPill } from "../sync/SyncPill";
import { recoveryFor } from "../sync/syncCopy";
import { NOT_RECORDING, type SyncProblem, type SyncStatus } from "../sync/historyTypes";
import { subscribeToSetupSuccess } from "../sync/syncService";

/** Props for the {@link StatusBar} component. */
type StatusBarProps = {
  /** Currently open workspace display name, or null when no workspace is open. */
  readonly workspaceName: string | null;
  /** What this workspace's version saving is doing. */
  readonly syncStatus?: SyncStatus;
  /** Somewhere to go about what the sync pill reports. */
  readonly onOpenSyncPanel?: (panel: "conflicts" | "history") => void;
};

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
  syncStatus = NOT_RECORDING,
  onOpenSyncPanel
}: StatusBarProps) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  // Tracks which problem the user has already seen (auto-dismissed or closed).
  // The visible toast is derived from the current problem + this key, so a new
  // problem always shows without depending on a setState firing in an effect.
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  // Setup success is event-driven (credentials saved), not derived from status.
  const [setupReady, setSetupReady] = useState(false);
  const [setupDismissed, setSetupDismissed] = useState(false);
  // Pauses auto-dismiss while the pointer is over the toast, so a long message
  // or technical details can be read without the toast vanishing mid-sentence.
  // Kind-keyed so unmounting one toast under the pointer cannot pause the next.
  const [hoveredKind, setHoveredKind] = useState<"error" | "success" | null>(null);
  // Briefly shows a checkmark after the copy button is pressed.
  const [copied, setCopied] = useState(false);
  const problem = syncStatus.problem;
  const problemKey = problem ? `${problem.code}\0${problem.message}` : null;
  // When the problem clears, reset the dismissed key so the same problem
  // recurring later re-toasts (matches the original effect-based behavior).
  if (problem === null && dismissedKey !== null) {
    setDismissedKey(null);
  }
  // Errors win: a problem hides and consumes a pending setup-success toast.
  if (problem !== null && setupReady && !setupDismissed) {
    setSetupDismissed(true);
  }
  const toast = problem && problemKey !== dismissedKey ? problem : null;
  const successToast = setupReady && !setupDismissed && problem === null;
  const toastKind = toast ? "error" : successToast ? "success" : null;
  const isHovering = hoveredKind !== null && hoveredKind === toastKind;

  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;
    void subscribeToSetupSuccess(() => {
      if (cancelled) return;
      setSetupReady(true);
      setSetupDismissed(false);
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
  }, []);

  // Auto-dismiss the toast after 8 seconds, but only while the pointer is not
  // hovering over it. Re-entering clears the running timer; leaving starts a
  // fresh one. Only the async timer callback calls setState, so this effect
  // does not trigger cascading renders.
  useEffect(() => {
    if (toast === null || isHovering) return;
    const timeout = window.setTimeout(() => setDismissedKey(problemKey), 8_000);
    return () => window.clearTimeout(timeout);
  }, [toast, problemKey, isHovering]);

  useEffect(() => {
    if (!successToast || isHovering) return;
    const timeout = window.setTimeout(() => setSetupDismissed(true), 8_000);
    return () => window.clearTimeout(timeout);
  }, [successToast, isHovering]);

  // Clear the "Copied" confirmation shortly after it appears.
  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 2_000);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const notification = problem;

  return (
    <>
      {toast && (
        <aside
          role="alert"
          className="fixed bottom-8 right-3 z-100 w-80 rounded-lg border border-destructive bg-popover p-3 text-popover-foreground shadow-soft"
          onMouseEnter={() => setHoveredKind("error")}
          onMouseLeave={() => setHoveredKind(null)}
        >
          <p className="m-0 text-sm font-semibold">Sync needs attention</p>
          <p className="mb-0 mt-1 text-xs leading-relaxed">{toast.message}</p>
          <p className="mb-0 mt-1 text-xs leading-relaxed text-muted-foreground">{recoveryFor(toast.code)}</p>
          <Diagnostic details={toast.details} />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="rounded-small border border-border bg-surface px-2 py-1 text-xs"
              onClick={() => onOpenSyncPanel?.("history")}
            >
              Open saved versions
            </button>
            <button
              type="button"
              className="rounded-small px-2 py-1 text-xs text-muted-foreground"
              onClick={() => setDismissedKey(problemKey)}
            >
              Dismiss
            </button>
            <button
              type="button"
              className="ml-auto flex items-center gap-1 rounded-small px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              aria-label={copied ? "Copied" : "Copy message"}
              onClick={() => {
                void navigator.clipboard.writeText(fullToastText(toast));
                setCopied(true);
              }}
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </aside>
      )}
      {successToast && (
        <aside
          role="status"
          className="fixed bottom-8 right-3 z-100 w-80 rounded-lg border border-success bg-popover p-3 text-popover-foreground shadow-soft"
          onMouseEnter={() => setHoveredKind("success")}
          onMouseLeave={() => setHoveredKind(null)}
        >
          <p className="m-0 text-sm font-semibold">Git link is ready</p>
          <p className="mb-0 mt-1 text-xs leading-relaxed">
            Notes can now stay in step with this git link.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="rounded-small px-2 py-1 text-xs text-muted-foreground"
              onClick={() => setSetupDismissed(true)}
            >
              Dismiss
            </button>
          </div>
        </aside>
      )}
      <footer className="flex items-center gap-[0.8rem] px-2 bg-statusbar text-statusbar-foreground text-[0.68rem] overflow-hidden whitespace-nowrap">
        <span className="max-[760px]:hidden">{workspaceName ?? "No workspace open"}</span>
        <SyncPill status={syncStatus} onOpen={(panel) => onOpenSyncPanel?.(panel)} />
        <span className="flex-1 max-[760px]:block" />

        <div className="relative">
        <button
          type="button"
          onClick={() => setNotificationsOpen((open) => !open)}
          className={cn(
            "flex size-5 items-center justify-center rounded text-inherit hover:bg-accent",
            notificationsOpen && "bg-accent"
          )}
          aria-label="Notifications"
          aria-expanded={notificationsOpen}
        >
          <Bell className="size-3.5" />
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
                <button
                  type="button"
                  onClick={() => setNotificationsOpen(false)}
                  aria-label="Close notifications"
                  className="flex size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                >
                  ×
                </button>
              </div>
              {notification ? (
                <div className="flex flex-col gap-1 text-xs">
                  <span className="font-semibold">Sync needs attention</span>
                  <span>{notification.message}</span>
                  <span className="text-muted-foreground">{recoveryFor(notification.code)}</span>
                  <Diagnostic details={notification.details} />
                  <button
                    type="button"
                    className="mt-1 w-fit rounded-small border border-border bg-surface px-2 py-1 text-xs"
                    onClick={() => {
                      onOpenSyncPanel?.("history");
                      setNotificationsOpen(false);
                    }}
                  >
                    Open saved versions
                  </button>
                </div>
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

function Diagnostic({ details }: { readonly details?: string }) {
  if (!details) return null;
  return (
    <details className="mt-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer">Technical details</summary>
      <p className="mb-0 mt-1 break-words font-mono">{details}</p>
    </details>
  );
}

/** Composes the full toast text for copying — title, message, recovery, and
 *  any technical details — so a user can paste a complete report in one click. */
function fullToastText(problem: SyncProblem): string {
  const lines = [
    "Sync needs attention",
    problem.message,
    recoveryFor(problem.code),
  ];
  if (problem.details) lines.push(`Technical details: ${problem.details}`);
  return lines.filter(Boolean).join("\n");
}
