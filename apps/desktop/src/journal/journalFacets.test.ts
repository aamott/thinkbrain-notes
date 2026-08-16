import { describe, expect, it } from "vitest";

import {
  intersectPaths,
  predicateChips,
  predicateId,
  togglePredicate,
  type JournalFacet,
  type JournalPredicate
} from "./journalFacets";

const mood: JournalFacet = { key: "mood", label: "Mood", values: ["good", "tired"] };

describe("predicateId", () => {
  it("tells the number 7 apart from the string 7", () => {
    expect(predicateId({ key: "rating", value: 7 })).not.toBe(
      predicateId({ key: "rating", value: "7" })
    );
  });

  it("is the same for two predicates naming the same value", () => {
    expect(predicateId({ key: "mood", value: "good" })).toBe(
      predicateId({ key: "mood", value: "good" })
    );
  });
});

describe("togglePredicate", () => {
  it("adds one that is not active", () => {
    expect(togglePredicate([], { key: "mood", value: "good" })).toEqual([
      { key: "mood", value: "good" }
    ]);
  });

  it("removes one that is, matching by value rather than by identity", () => {
    const active: readonly JournalPredicate[] = [{ key: "mood", value: "good" }];
    expect(togglePredicate(active, { key: "mood", value: "good" })).toEqual([]);
  });

  it("keeps a second value of the same field, which asks for entries carrying both (D43)", () => {
    const active: readonly JournalPredicate[] = [{ key: "mood", value: "good" }];
    expect(togglePredicate(active, { key: "mood", value: "tired" })).toEqual([
      { key: "mood", value: "good" },
      { key: "mood", value: "tired" }
    ]);
  });
});

describe("intersectPaths", () => {
  it("is the other set when one side filters nothing", () => {
    const paths = new Set(["journal/a.md"]);
    expect(intersectPaths(null, paths)).toBe(paths);
    expect(intersectPaths(paths, null)).toBe(paths);
  });

  it("is null when neither side filters", () => {
    expect(intersectPaths(null, null)).toBeNull();
  });

  it("keeps only what both sides matched, so search runs inside the filter (D16)", () => {
    const found = intersectPaths(
      new Set(["journal/a.md", "journal/b.md"]),
      new Set(["journal/b.md", "journal/c.md"])
    );
    expect([...(found ?? [])]).toEqual(["journal/b.md"]);
  });

  it("is empty rather than null when the two sides share nothing", () => {
    const found = intersectPaths(new Set(["journal/a.md"]), new Set(["journal/b.md"]));
    expect(found).not.toBeNull();
    expect(found?.size).toBe(0);
  });
});

describe("predicateChips", () => {
  it("names a predicate by its field's label", () => {
    expect(predicateChips([{ key: "mood", value: "good" }], [mood])).toEqual([
      { id: predicateId({ key: "mood", value: "good" }), label: "Mood good" }
    ]);
  });

  it("falls back to the frontmatter key for a field nothing configures (D45)", () => {
    expect(predicateChips([{ key: "weather", value: "rain" }], [mood])).toEqual([
      { id: predicateId({ key: "weather", value: "rain" }), label: "weather rain" }
    ]);
  });
});
