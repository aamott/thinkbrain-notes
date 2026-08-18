import { describe, expect, it } from "vitest";

import {
  countLines,
  isSettled,
  mergedText,
  resultSegments,
  undecidedCount,
  type ChunkPick
} from "./mergeModel";
import type { ConflictChunk } from "./conflictTypes";

const common = (text: string): ConflictChunk => ({ kind: "common", text });
const choice = (ours: string, theirs: string): ConflictChunk => ({ kind: "choice", ours, theirs });

const NOTE: readonly ConflictChunk[] = [
  common("# Note\n"),
  choice("mine\n", "theirs\n"),
  common("end\n")
];

const picks = (entries: Record<number, ChunkPick>): ReadonlyMap<number, ChunkPick> =>
  new Map(Object.entries(entries).map(([index, pick]) => [Number(index), pick]));

describe("mergedText", () => {
  it("keeps this computer's side of a chunk", () => {
    expect(mergedText(NOTE, picks({ 1: "ours" }))).toBe("# Note\nmine\nend\n");
  });

  it("keeps the other side of a chunk", () => {
    expect(mergedText(NOTE, picks({ 1: "theirs" }))).toBe("# Note\ntheirs\nend\n");
  });

  it("keeps both sides in the order they are shown", () => {
    expect(mergedText(NOTE, picks({ 1: "both" }))).toBe("# Note\nmine\ntheirs\nend\n");
  });

  // Without this the two versions run together into one corrupt line — the one
  // case where "keep both" loses content rather than keeping it.
  it("separates both sides when the first does not end a line", () => {
    const ragged = [choice("mine", "theirs")];

    expect(mergedText(ragged, picks({ 0: "both" }))).toBe("mine\ntheirs");
  });

  it("does not invent a separator when a side is empty", () => {
    expect(mergedText([choice("", "added\n")], picks({ 0: "both" }))).toBe("added\n");
    expect(mergedText([choice("kept\n", "")], picks({ 0: "both" }))).toBe("kept\n");
  });

  // An undecided chunk still has to render as a real document, or the preview
  // is not a preview of anything.
  it("shows this computer's side for a chunk nobody has decided", () => {
    expect(mergedText(NOTE, picks({}))).toBe("# Note\nmine\nend\n");
  });

  it("is exactly the note again when there is nothing to choose", () => {
    expect(mergedText([common("just text\n")], picks({}))).toBe("just text\n");
  });
});

describe("undecidedCount", () => {
  it("counts only the chunks still waiting on someone", () => {
    const two = [choice("a\n", "A\n"), common("x\n"), choice("b\n", "B\n")];

    expect(undecidedCount(two, picks({}))).toBe(2);
    expect(undecidedCount(two, picks({ 0: "ours" }))).toBe(1);
    expect(undecidedCount(two, picks({ 0: "ours", 2: "both" }))).toBe(0);
  });

  it("ignores a decision recorded against a common chunk", () => {
    expect(undecidedCount(NOTE, picks({ 0: "ours", 2: "ours" }))).toBe(1);
  });
});

describe("isSettled", () => {
  // Saving with an undecided chunk would accept a default the user never
  // looked at, in the one feature where that means losing someone's writing.
  it("is false until every choice has been made", () => {
    expect(isSettled(NOTE, picks({}))).toBe(false);
    expect(isSettled(NOTE, picks({ 1: "theirs" }))).toBe(true);
  });

  it("is true for a comparison with nothing to choose", () => {
    expect(isSettled([common("all agreed\n")], picks({}))).toBe(true);
  });
});

describe("resultSegments", () => {
  it("marks what came from a decision and what is still standing in", () => {
    expect(resultSegments(NOTE, picks({}))).toEqual([
      { text: "# Note\n", state: "common", index: 0 },
      { text: "mine\n", state: "pending", index: 1 },
      { text: "end\n", state: "common", index: 2 }
    ]);
  });

  it("marks a decided chunk as chosen", () => {
    expect(resultSegments(NOTE, picks({ 1: "theirs" }))[1]).toEqual({
      text: "theirs\n",
      state: "chosen",
      index: 1
    });
  });

  it("joins back into exactly the merged text", () => {
    for (const pick of ["ours", "theirs", "both"] as const) {
      const chosen = picks({ 1: pick });
      const joined = resultSegments(NOTE, chosen)
        .map((segment) => segment.text)
        .join("");

      expect(joined).toBe(mergedText(NOTE, chosen));
    }
  });

  // A chunk where one side is empty and that side wins contributes nothing;
  // a blank row in the preview would read as a blank line in the note.
  it("leaves out a segment with no text in it", () => {
    expect(resultSegments([choice("", "added\n")], picks({ 0: "ours" }))).toEqual([]);
  });
});

describe("countLines", () => {
  it("counts the lines in a collapsed stretch", () => {
    expect(countLines("one\ntwo\nthree\n")).toBe(3);
  });

  it("counts a last line that never ended", () => {
    expect(countLines("one\ntwo")).toBe(2);
  });

  it("counts nothing in nothing", () => {
    expect(countLines("")).toBe(0);
  });
});
