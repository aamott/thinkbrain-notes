import { describe, expect, it } from "vitest";
import { listWindow, rowOffsets, type ListWindow } from "./listWindow";

/** Every row 10px tall, so an expected index is readable as `scrollTop / 10`. */
const uniform = (count: number): readonly number[] => Array.from({ length: count }, () => 10);

/**
 * The one invariant the scrollbar depends on: what is skipped, what is drawn,
 * and what is left add up to the list's real height. A window that renders the
 * right rows but mismeasures the space around them scrolls to the wrong place.
 */
function assertSpansTheList(
  window: ListWindow,
  heights: readonly number[]
): void {
  const drawn = heights
    .slice(window.startIndex, window.endIndex)
    .reduce((total, height) => total + height, 0);
  const listHeight = heights.reduce((total, height) => total + height, 0);
  expect(window.leadingSpace + drawn + window.trailingSpace).toBe(listHeight);
}

describe("row offsets", () => {
  it("gives every row its top edge, and the list its height", () => {
    expect(rowOffsets([10, 24, 6])).toEqual([0, 10, 34, 40]);
  });

  it("measures an empty list as a single zero", () => {
    expect(rowOffsets([])).toEqual([0]);
  });
});

describe("list window", () => {
  it("draws nothing for an empty list", () => {
    expect(listWindow(rowOffsets([]), 0, 500, 0)).toEqual({
      startIndex: 0,
      endIndex: 0,
      leadingSpace: 0,
      trailingSpace: 0
    });
  });

  it("starts at the top and covers the viewport, leaving the rest below", () => {
    const heights = uniform(100);

    const window = listWindow(rowOffsets(heights), 0, 50, 0);

    expect(window.startIndex).toBe(0);
    expect(window.endIndex).toBe(5);
    expect(window.leadingSpace).toBe(0);
    expect(window.trailingSpace).toBe(950);
    assertSpansTheList(window, heights);
  });

  /**
   * A row crossing the top edge is half on screen, so it has to be drawn. Taking
   * the first row fully below the edge would leave a gap the height of one row.
   */
  it("keeps the row straddling the top edge", () => {
    const heights = uniform(100);

    const window = listWindow(rowOffsets(heights), 45, 50, 0);

    expect(window.startIndex).toBe(4);
    expect(window.endIndex).toBe(10);
    expect(window.leadingSpace).toBe(40);
    assertSpansTheList(window, heights);
  });

  it("draws past both edges by the overscan, without running off either end", () => {
    const heights = uniform(100);

    const middle = listWindow(rowOffsets(heights), 500, 50, 3);
    expect(middle.startIndex).toBe(47);
    expect(middle.endIndex).toBe(58);
    assertSpansTheList(middle, heights);

    const top = listWindow(rowOffsets(heights), 0, 50, 3);
    expect(top.startIndex).toBe(0);
    assertSpansTheList(top, heights);

    const bottom = listWindow(rowOffsets(heights), 950, 50, 3);
    expect(bottom.endIndex).toBe(100);
    expect(bottom.trailingSpace).toBe(0);
    assertSpansTheList(bottom, heights);
  });

  /** Headers and entries are different heights, so the edges are not arithmetic. */
  it("finds the edges in a list of mixed heights", () => {
    const heights = [30, 44, 44, 30, 44, 44, 44];

    const window = listWindow(rowOffsets(heights), 80, 60, 0);

    // 80px in is inside row 2 (74–118); 140px out ends inside row 4 (148 is past it).
    expect(window.startIndex).toBe(2);
    expect(window.endIndex).toBe(4);
    expect(window.leadingSpace).toBe(74);
    assertSpansTheList(window, heights);
  });

  it("draws the whole list when it is shorter than the viewport", () => {
    const heights = uniform(3);

    const window = listWindow(rowOffsets(heights), 0, 500, 0);

    expect(window).toEqual({
      startIndex: 0,
      endIndex: 3,
      leadingSpace: 0,
      trailingSpace: 0
    });
  });

  /**
   * Filtering can shorten the list under a scroll position the browser has not
   * corrected yet. Trusting that offset would ask for rows past the end and
   * subtract its way to a negative spacer.
   */
  it("survives a scroll position past the end of a list that shrank", () => {
    const heights = uniform(5);

    const window = listWindow(rowOffsets(heights), 4000, 50, 2);

    expect(window.startIndex).toBe(2);
    expect(window.endIndex).toBe(5);
    expect(window.trailingSpace).toBe(0);
    assertSpansTheList(window, heights);

    // With nothing overscanned to cover for it, the row the position lands past
    // is the last one; answering with the index after it would draw an empty
    // list while the scrollbar says there is something there.
    const exact = listWindow(rowOffsets(heights), 4000, 50, 0);
    expect(exact.startIndex).toBe(4);
    expect(exact.endIndex).toBe(5);
    assertSpansTheList(exact, heights);
  });

  /**
   * The panel has no height until it has been laid out once, and a caller that
   * measures its row heights from what it drew cannot get started if that first
   * pass draws nothing. So an unmeasured viewport still draws the overscan — and
   * the list is still its full height, or the scrollbar appears and then leaves.
   */
  it("draws only the overscan before the viewport has been measured", () => {
    const heights = uniform(100);

    const unmeasured = listWindow(rowOffsets(heights), 0, 0, 3);
    expect(unmeasured.startIndex).toBe(0);
    expect(unmeasured.endIndex).toBe(3);
    expect(unmeasured.trailingSpace).toBe(970);
    assertSpansTheList(unmeasured, heights);

    const withoutOverscan = listWindow(rowOffsets(heights), 0, 0, 0);
    expect(withoutOverscan.endIndex).toBe(0);
    expect(withoutOverscan.trailingSpace).toBe(1000);
    assertSpansTheList(withoutOverscan, heights);
  });

  /**
   * A trackpad's overscroll bounce reports a negative position on macOS. It is
   * momentary, but it must not index off the front of the list.
   */
  it("survives a scroll position above the top of the list", () => {
    const heights = uniform(100);

    const window = listWindow(rowOffsets(heights), -400, 50, 2);

    expect(window.startIndex).toBe(0);
    expect(window.leadingSpace).toBe(0);
    assertSpansTheList(window, heights);
  });
});
