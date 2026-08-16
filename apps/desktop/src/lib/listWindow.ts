/**
 * Which rows of a long list are worth drawing, and how much space to leave for
 * the ones that are not.
 *
 * Deliberately knows nothing about React, the DOM, or what a row contains: it
 * takes heights and a scroll position and returns indices. That keeps the part
 * that is easy to get wrong — the arithmetic at the edges, a list that shrinks
 * under the scroll position, a viewport that has not been measured yet — under
 * test without a browser, and lets more than one list share it. The journal is
 * the first; the explorer tree, search results and the outline have the same
 * problem.
 *
 * Heights are supplied rather than measured because the caller can derive them:
 * a list of rows of a few known kinds knows each row's kind before it draws it.
 */

/** The slice to draw, and the space standing in for what is not drawn. */
export interface ListWindow {
  readonly startIndex: number;
  /** Exclusive, so `rows.slice(startIndex, endIndex)` is the slice to draw. */
  readonly endIndex: number;
  /** Height of the rows above the slice. */
  readonly leadingSpace: number;
  /** Height of the rows below it. */
  readonly trailingSpace: number;
}

/**
 * Turns row heights into the top edge of every row, plus the list's own height
 * as a final entry — so `offsets[i]` is where row `i` starts, `offsets[i + 1]`
 * is where it ends, and `offsets.at(-1)` is how tall the whole list is.
 *
 * Built once per change to the list rather than per scroll event, which is what
 * makes {@link listWindow} a binary search instead of a walk.
 */
export function rowOffsets(heights: readonly number[]): readonly number[] {
  const offsets = [0];
  for (const height of heights) {
    offsets.push(offsets[offsets.length - 1]! + height);
  }
  return offsets;
}

/**
 * Index of the last row starting at or before `edge`, by binary search.
 *
 * Bounded by the list rather than by the edge, so a scroll position past the
 * end — which filtering produces, by shortening the list under a position the
 * browser has not corrected yet — answers with the last row instead of running
 * off it. The same bound is why a negative position answers with the first.
 */
function rowCovering(offsets: readonly number[], edge: number): number {
  let low = 0;
  let high = offsets.length - 2;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (offsets[middle]! <= edge) low = middle;
    else high = middle - 1;
  }
  return low;
}

/**
 * Index of the first row starting at or past `edge` — the exclusive end of the
 * rows that edge cuts through. Returns the row count when none does.
 *
 * Not the same as the row covering the edge plus one: when the edge lands
 * exactly on a boundary the row below it starts there and is not on screen, so
 * counting it would draw one row more than the viewport ever shows.
 */
function rowStartingAtOrAfter(offsets: readonly number[], edge: number): number {
  let low = 0;
  let high = offsets.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (offsets[middle]! >= edge) high = middle;
    else low = middle + 1;
  }
  return low;
}

/**
 * Picks the rows covering the viewport, plus `overscan` rows either side so a
 * scroll does not reach an undrawn row before the next render.
 *
 * A row crossing the top edge is drawn: it is half on screen, and starting at
 * the first row fully below the edge would open a gap the height of one row.
 *
 * A viewport of zero — the panel before its first layout — draws the overscan
 * and nothing more. That is on purpose rather than a guard: a caller measuring
 * its row heights from what it drew needs *something* drawn to measure, and it
 * cannot report a viewport until it has laid one out.
 */
export function listWindow(
  offsets: readonly number[],
  scrollTop: number,
  viewportHeight: number,
  overscan: number
): ListWindow {
  const rowCount = offsets.length - 1;
  const listHeight = offsets[rowCount]!;
  const first = Math.max(0, rowCovering(offsets, scrollTop) - overscan);
  const last = Math.min(rowCount, rowStartingAtOrAfter(offsets, scrollTop + viewportHeight) + overscan);

  return {
    startIndex: first,
    endIndex: last,
    leadingSpace: offsets[first]!,
    trailingSpace: listHeight - offsets[last]!
  };
}
