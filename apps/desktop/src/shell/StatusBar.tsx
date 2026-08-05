/**
 * StatusBar — the desktop shell footer.
 *
 * Extracted from DesktopShell.tsx as part of the "Desktop Shell Composition"
 * story (plans/ui-shell/pending-desktop_shell_composition-high-hard.md).
 *
 * Renders workspace metadata, problem counters, indexer status, cursor
 * position, encoding, language, and the bottom-panel toggle button.
 */

import { cn } from "../lib/utils";
import type { BottomPanel } from "./shellTypes";

/** Props for the {@link StatusBar} component. */
type StatusBarProps = {
  /** Currently open workspace display name, or null when no workspace is open. */
  readonly workspaceName: string | null;
  /** Currently open bottom panel, or null when the bottom panel is closed. */
  readonly bottomPanel: BottomPanel | null;
  /** Callback invoked when the user clicks the bottom-panel toggle button. */
  readonly onToggleBottomPanel: () => void;
};

/**
 * Desktop shell status bar footer.
 *
 * Layout:
 * - Left: workspace name, problem counters (✓ 0 ⚠ 0), indexer status.
 * - Spacer.
 * - Right: workspace status, cursor position, indentation, encoding, language.
 * - Far right: bottom-panel toggle button (▰) with active-state styling.
 */
export function StatusBar({ workspaceName, bottomPanel, onToggleBottomPanel }: StatusBarProps) {
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
      <button
        className={cn(
          "h-full cursor-pointer border-0 bg-transparent px-1 text-inherit hover:bg-accent",
          bottomPanel && "bg-accent"
        )}
        type="button"
        onClick={onToggleBottomPanel}
        aria-label="Toggle bottom panel"
        aria-pressed={Boolean(bottomPanel)}
      >
        ▰
      </button>
    </footer>
  );
}
