/**
 * StatusBar — the desktop shell footer.
 *
 * Extracted from DesktopShell.tsx as part of the "Desktop Shell Composition"
 * story (plans/ui-shell/pending-desktop_shell_composition-high-hard.md).
 *
 * Renders workspace metadata, problem counters, indexer status, cursor
 * position, encoding, language, and a notifications bell that opens a small
 * toast popover. The bottom-panel toggle is no longer surfaced here — the
 * panel is opened via the activity bar / command palette / Ctrl+J shortcut.
 */

import { useState } from "react";
import { Bell } from "lucide-react";
import { cn } from "../lib/utils";

/** Props for the {@link StatusBar} component. */
type StatusBarProps = {
  /** Currently open workspace display name, or null when no workspace is open. */
  readonly workspaceName: string | null;
};

/**
 * Desktop shell status bar footer.
 *
 * Layout:
 * - Left: workspace name, problem counters (✓ 0 ⚠ 0), indexer status.
 * - Spacer.
 * - Right: workspace status, cursor position, indentation, encoding, language.
 * - Far right: notifications bell button opening a small toast popover.
 */
export function StatusBar({ workspaceName }: StatusBarProps) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  return (
    <footer className="flex items-center gap-[0.8rem] px-2 bg-statusbar text-statusbar-foreground text-[0.68rem] overflow-hidden whitespace-nowrap">
      <span className="max-[760px]:hidden">{workspaceName ?? "No workspace open"}</span>
      <span className="max-[760px]:hidden">✓ 0 &nbsp; ⚠ 0</span>
      <span className="max-[760px]:hidden">✦ Indexer unavailable</span>
      <span className="flex-1 max-[760px]:block" />
      <span className="max-[760px]:hidden">{workspaceName ? "Workspace open" : "Open a workspace to begin"}</span>
      <span className="max-[760px]:hidden">Ln —, Col —</span>
      <span className="max-[760px]:hidden">Spaces: —</span>
      <span className="max-[760px]:hidden">UTF-8</span>
      <span className="max-[760px]:hidden">Markdown</span>

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
