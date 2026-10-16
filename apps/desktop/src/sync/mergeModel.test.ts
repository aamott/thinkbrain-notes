import { describe, expect, it } from "vitest";

import type { ConflictBase } from "./conflictTypes";
import { lineDelta, mergeIsProven } from "./mergeModel";

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

describe("mergeIsProven", () => {
  const base = (confidence: ConflictBase["confidence"]): ConflictBase => ({
    id: "9a8d80c",
    source: "recorded",
    confidence,
    riskyHunks: confidence === "proven" ? 0 : 2
  });

  it("trusts a base the native side proved cannot drop our text", () => {
    expect(mergeIsProven(base("proven"))).toBe(true);
  });

  // Ambiguous or missing: both versions stay for a person to compare.
  it("leaves an ambiguous base for review", () => {
    expect(mergeIsProven(base("ambiguous"))).toBe(false);
  });

  it("leaves a conflict with no base, or an older payload without one, for review", () => {
    expect(mergeIsProven(null)).toBe(false);
    expect(mergeIsProven(undefined)).toBe(false);
  });
});
