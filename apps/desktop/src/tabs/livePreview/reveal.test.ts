import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { selectionTouchesLine, selectionTouchesRange } from "./reveal";

const stateAt = (doc: string, anchor: number, head = anchor): EditorState =>
  EditorState.create({ doc, selection: { anchor, head } });

describe("selectionTouchesRange", () => {
  it("is false when the cursor sits outside the range", () => {
    // doc: "a **b** c" — the StrongEmphasis node spans 2..7.
    expect(selectionTouchesRange(stateAt("a **b** c", 0), 2, 7)).toBe(false);
  });

  it("is true when the cursor sits inside the range", () => {
    expect(selectionTouchesRange(stateAt("a **b** c", 4), 2, 7)).toBe(true);
  });

  it("is true when the cursor sits exactly on either boundary", () => {
    expect(selectionTouchesRange(stateAt("a **b** c", 2), 2, 7)).toBe(true);
    expect(selectionTouchesRange(stateAt("a **b** c", 7), 2, 7)).toBe(true);
  });

  it("is true when a selection merely overlaps the range", () => {
    expect(selectionTouchesRange(stateAt("a **b** c", 0, 3), 2, 7)).toBe(true);
  });

  it("is true when any range of a multi-range selection overlaps", () => {
    const state = EditorState.create({
      doc: "a **b** c",
      selection: EditorSelection.create(
        [EditorSelection.cursor(0), EditorSelection.cursor(4)],
        0
      ),
      extensions: [EditorState.allowMultipleSelections.of(true)]
    });
    expect(selectionTouchesRange(state, 2, 7)).toBe(true);
  });
});

describe("selectionTouchesLine", () => {
  it("is false when the cursor is on a different line", () => {
    expect(selectionTouchesLine(stateAt("## one\n\ntwo", 8), 0)).toBe(false);
  });

  it("is true anywhere on the same line", () => {
    expect(selectionTouchesLine(stateAt("## one\n\ntwo", 5), 0)).toBe(true);
  });

  it("is true when a multi-line selection covers the line", () => {
    expect(selectionTouchesLine(stateAt("## one\n\ntwo", 0, 10), 3)).toBe(true);
  });
});
