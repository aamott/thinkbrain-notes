import type { EditorState } from "@codemirror/state";

/**
 * Selection-overlap predicates that decide whether a construct shows its raw
 * Markdown source.
 *
 * Boundary positions count as touching: a cursor resting immediately after
 * `**bold**` still reveals it, which is what a user editing the end of a word
 * expects. Both predicates consider every range of a multi-range selection.
 */

/** True when any selection range overlaps the inclusive span `[from, to]`. */
export function selectionTouchesRange(
  state: EditorState,
  from: number,
  to: number
): boolean {
  return state.selection.ranges.some((range) => range.from <= to && range.to >= from);
}

/** True when any selection range overlaps the line containing `pos`. */
export function selectionTouchesLine(state: EditorState, pos: number): boolean {
  const line = state.doc.lineAt(pos);
  return selectionTouchesRange(state, line.from, line.to);
}
