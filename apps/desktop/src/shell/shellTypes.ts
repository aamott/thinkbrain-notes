/**
 * Shared shell primitives extracted from DesktopShell.tsx.
 *
 * These types and action descriptors describe the activity bar panels and
 * document view state used throughout the desktop shell composition.
 */

/** Activity bar panel ids rendered on the left side of the shell. */
export type LeftPanel = "explorer" | "search" | "source-control" | "tags" | "extensions";

/** Activity bar panel ids rendered on the right side of the shell. */
export type RightPanel = "outline" | "backlinks" | "properties" | "assistant";

/** Bottom dock panel ids. */
export type BottomPanel = "terminal" | "problems" | "output" | "backlinks";

/** Lifecycle + contents of a single open Markdown document view. */
export type DocumentViewState = {
  readonly contents: string;
  readonly phase: "loading" | "ready" | "saving" | "error";
  readonly error: string | null;
};

/** Action descriptor for a left activity bar button. */
export type LeftAction = { id: LeftPanel; label: string; symbol: string };

/** Action descriptor for a right activity bar button. */
export type RightAction = { id: RightPanel; label: string; symbol: string };

/** Left activity bar entries, in display order. */
export const leftActions: readonly LeftAction[] = [
  { id: "explorer", label: "Explorer", symbol: "▱" },
  { id: "search", label: "Search", symbol: "⌕" },
  { id: "source-control", label: "Source control", symbol: "⑂" },
  { id: "tags", label: "Tags", symbol: "#" },
  { id: "extensions", label: "Extensions", symbol: "⊞" }
];

/** Right activity bar entries, in display order. */
export const rightActions: readonly RightAction[] = [
  { id: "outline", label: "Outline", symbol: "☷" },
  { id: "backlinks", label: "Backlinks", symbol: "↩" },
  { id: "properties", label: "Properties", symbol: "☰" },
  { id: "assistant", label: "Assistant", symbol: "✦" }
];
