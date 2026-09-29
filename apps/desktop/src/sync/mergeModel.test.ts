import { describe, expect, it } from "vitest";

import { lineDelta, sideText } from "./mergeModel";
import type { ConflictChunk } from "./conflictTypes";

const common = (text: string): ConflictChunk => ({ kind: "common", text });
const choice = (ours: string, theirs: string): ConflictChunk => ({ kind: "choice", ours, theirs });

describe("sideText", () => {
  it("rebuilds each whole version, common stretches and choices alike", () => {
    const chunks = [
      common("# Note\n"),
      choice("mine\n", "theirs\n"),
      common("end\n")
    ];

    expect(sideText(chunks, "ours")).toBe("# Note\nmine\nend\n");
    expect(sideText(chunks, "theirs")).toBe("# Note\ntheirs\nend\n");
  });

  // A choice chunk with an empty half is an insertion or a deletion — the
  // empty side must contribute nothing rather than a stray newline.
  it("rebuilds an insertion without inventing content for the other side", () => {
    const chunks = [common("start\n"), choice("", "added\n"), common("done\n")];

    expect(sideText(chunks, "ours")).toBe("start\ndone\n");
    expect(sideText(chunks, "theirs")).toBe("start\nadded\ndone\n");
  });

  it("rebuilds a deletion without inventing content for the other side", () => {
    const chunks = [common("start\n"), choice("removed\n", ""), common("done\n")];

    expect(sideText(chunks, "ours")).toBe("start\nremoved\ndone\n");
    expect(sideText(chunks, "theirs")).toBe("start\ndone\n");
  });

  // A file that never ended its last line has no trailing newline to find —
  // joining the chunks must not grow one.
  it("does not invent a trailing newline", () => {
    const chunks = [common("one\n"), choice("two", "2")];

    expect(sideText(chunks, "ours")).toBe("one\ntwo");
    expect(sideText(chunks, "theirs")).toBe("one\n2");
  });

  it("rebuilds text beyond ASCII exactly", () => {
    const chunks = [
      common("# ノート\n"),
      choice("café — façade\n", "emoji ☕️ and 中文\n")
    ];

    expect(sideText(chunks, "ours")).toBe("# ノート\ncafé — façade\n");
    expect(sideText(chunks, "theirs")).toBe("# ノート\nemoji ☕️ and 中文\n");
  });

  it("rebuilds an empty comparison as empty", () => {
    expect(sideText([], "ours")).toBe("");
    expect(sideText([], "theirs")).toBe("");
  });
});

describe("lineDelta", () => {
  it("counts identical texts as no change", () => {
    expect(lineDelta("same\nfile\n", "same\nfile\n")).toEqual({ added: 0, removed: 0 });
  });

  it("counts a pure insertion as added lines only", () => {
    expect(lineDelta("start\ndone\n", "start\nadded\ndone\n")).toEqual({ added: 1, removed: 0 });
  });

  it("counts a pure deletion as removed lines only", () => {
    expect(lineDelta("start\nremoved\ndone\n", "start\ndone\n")).toEqual({ added: 0, removed: 1 });
  });

  it("counts a replaced line once on each side", () => {
    expect(lineDelta("one\ntwo\nthree\n", "one\n2\nthree\n")).toEqual({ added: 1, removed: 1 });
  });

  it("counts a block replacement spanning several lines", () => {
    expect(lineDelta("a\nb\nx\nc\n", "a\nb\ny\nz\nc\n")).toEqual({ added: 2, removed: 1 });
  });

  // The line the newline lands on is itself a changed line, so appending to a
  // file that never ended its last line counts that line on both sides.
  it("handles files that do not end in a newline", () => {
    expect(lineDelta("one\ntwo", "one\ntwo\nthree")).toEqual({ added: 2, removed: 1 });
    expect(lineDelta("one\ntwo\nthree", "one\ntwo")).toEqual({ added: 1, removed: 2 });
  });

  it("counts an emptied file as every line removed", () => {
    expect(lineDelta("a\nb\n", "")).toEqual({ added: 0, removed: 2 });
  });
});
