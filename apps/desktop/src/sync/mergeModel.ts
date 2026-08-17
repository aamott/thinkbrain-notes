/**
 * Turning a set of per-chunk decisions into the note that will be saved.
 *
 * Everything here is a pure function of the chunks and the picks, which is the
 * point: the Result pane in the merge view is not a summary of what will
 * happen, it is the same function the save uses. If the preview and the saved
 * file could ever disagree, the reassurance the whole screen is built on would
 * be a lie.
 */

import type { ConflictChunk } from "./conflictTypes";

/** What the user chose for one differing stretch. */
export type ChunkPick = "ours" | "theirs" | "both";

/** Decisions so far, keyed by the chunk's position in the comparison. */
export type ChunkPicks = ReadonlyMap<number, ChunkPick>;

/** How a stretch of the result came to be there. */
export type SegmentState =
  | "common"
  /** The user picked this. */
  | "chosen"
  /** Nobody has decided yet; this is what would be kept if they stopped now. */
  | "pending";

export interface ResultSegment {
  readonly text: string;
  readonly state: SegmentState;
  /** Which chunk this came from, so the preview can point back at it. */
  readonly index: number;
}

/**
 * The text of one chunk under a decision.
 *
 * An undecided chunk answers with our side, so the preview is always a real
 * document rather than a form with holes in it. The Done button is what stops
 * that standing-in from being saved by accident — see {@link isSettled}.
 */
function textOf(chunk: ConflictChunk, pick: ChunkPick | undefined): string {
  if (chunk.kind === "common") return chunk.text;
  switch (pick) {
    case "theirs":
      return chunk.theirs;
    case "both":
      return joinBoth(chunk.ours, chunk.theirs);
    default:
      return chunk.ours;
  }
}

/**
 * Both versions, one after the other, without running them into one line.
 *
 * A chunk's text carries its own line endings, but a version whose last line
 * was never ended — the end of a file with no trailing newline — would
 * otherwise be glued to the first line of the other. That is the one way
 * "keep both" could lose a line instead of keeping two.
 */
function joinBoth(ours: string, theirs: string): string {
  if (!ours || !theirs) return `${ours}${theirs}`;
  return ours.endsWith("\n") ? `${ours}${theirs}` : `${ours}\n${theirs}`;
}

/** The note as it would be saved right now. */
export function mergedText(chunks: readonly ConflictChunk[], picks: ChunkPicks): string {
  return chunks.map((chunk, index) => textOf(chunk, picks.get(index))).join("");
}

/**
 * The result broken into labelled stretches, for the live preview.
 *
 * Joining every `text` reproduces {@link mergedText} exactly — a test holds
 * that, because a preview that drifts from the save is worse than no preview.
 */
export function resultSegments(
  chunks: readonly ConflictChunk[],
  picks: ChunkPicks
): readonly ResultSegment[] {
  const segments: ResultSegment[] = [];
  chunks.forEach((chunk, index) => {
    const text = textOf(chunk, picks.get(index));
    // A side that is empty and wins contributes nothing. Keeping it would draw
    // a blank row that reads as a blank line in the note.
    if (!text) return;
    const state: SegmentState =
      chunk.kind === "common" ? "common" : picks.has(index) ? "chosen" : "pending";
    segments.push({ text, state, index });
  });
  return segments;
}

/** How many differing stretches are still waiting on a decision. */
export function undecidedCount(chunks: readonly ConflictChunk[], picks: ChunkPicks): number {
  return chunks.filter((chunk, index) => chunk.kind === "choice" && !picks.has(index)).length;
}

/**
 * Whether every choice has been made.
 *
 * Saving before this is true would accept a side the user never looked at, in
 * the one screen where that means quietly discarding someone's writing.
 */
export function isSettled(chunks: readonly ConflictChunk[], picks: ChunkPicks): boolean {
  return undecidedCount(chunks, picks) === 0;
}

/** Lines in a stretch, for the "14 identical lines" summary. */
export function countLines(text: string): number {
  if (!text) return 0;
  const ended = text.split("\n").length - 1;
  return text.endsWith("\n") ? ended : ended + 1;
}
