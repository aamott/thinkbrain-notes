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

import { useState } from "react";
import { Bell } from "lucide-react";
import { cn } from "../lib/utils";
import { SyncPill } from "../sync/SyncPill";
import { NOT_RECORDING, type SyncStatus } from "../sync/historyTypes";

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

  return (
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
              <p className="m-0 text-xs text-muted-foreground">No notifications</p>
            </div>
          </>
        )}
      </div>
    </footer>
  );
}
