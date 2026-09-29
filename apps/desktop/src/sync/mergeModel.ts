/**
 * Rebuilding one whole version out of a comparison's chunks, and counting how
 * far apart two versions are.
 *
 * The native side hands over the two versions interleaved — stretches they
 * share, and where they disagree each side's text separately. CodeMirror's
 * merge view compares two complete documents, so this puts each one back
 * together, exactly, for it to diff. `lineDelta` uses the same differ the
 * view does, so the badge on a revision card and the comparison it opens
 * can never disagree about how much changed.
 */

import { Chunk } from "@codemirror/merge";
import { Text } from "@codemirror/state";

import type { ConflictChunk } from "./conflictTypes";

/**
 * Every byte of one side of a comparison.
 *
 * A common stretch belongs to both versions; a choice chunk contributes only
 * the side asked for — including an empty half, which is how an insertion or
 * a deletion reads back exactly as it was written.
 */
export function sideText(
  chunks: readonly ConflictChunk[],
  side: "ours" | "theirs"
): string {
  return chunks
    .map((chunk) => (chunk.kind === "common" ? chunk.text : chunk[side]))
    .join("");
}

/** Whole lines that differ between two texts, split by direction. */
export interface LineDelta {
  /** Lines present in `after` but not in `before`. */
  readonly added: number;
  /** Lines present in `before` but not in `after`. */
  readonly removed: number;
}

/**
 * The one-line summary of how two versions differ, counted by the same
 * CodeMirror differ that aligns the side-by-side comparison.
 *
 * Chunks are line-aligned: a change covering a line counts that whole line on
 * both sides, so a replaced line reads `+1 -1`, not a character edit. A chunk
 * empty on one side (`toA === fromA`) is a pure insertion and removes nothing.
 * `endA`/`endB` clamp back inside the document, which keeps the count right
 * when a change runs to the end of a file that does not end in a newline.
 */
export function lineDelta(before: string, after: string): LineDelta {
  const a = Text.of(before.split("\n"));
  const b = Text.of(after.split("\n"));
  let added = 0;
  let removed = 0;
  for (const chunk of Chunk.build(a, b)) {
    if (chunk.toA > chunk.fromA) {
      removed += a.lineAt(chunk.endA).number - a.lineAt(chunk.fromA).number + 1;
    }
    if (chunk.toB > chunk.fromB) {
      added += b.lineAt(chunk.endB).number - b.lineAt(chunk.fromB).number + 1;
    }
  }
  return { added, removed };
}
