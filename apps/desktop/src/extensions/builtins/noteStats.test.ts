import { describe, expect, it } from "vitest";

import { computeNoteStats, noteStatsManifest } from "./noteStats";

describe("computeNoteStats", () => {
  it("counts words and characters", () => {
    expect(computeNoteStats("one two three", 200)).toMatchObject({ words: 3, characters: 13 });
  });

  it("treats an empty or missing document as zero", () => {
    expect(computeNoteStats("", 200)).toMatchObject({ words: 0, characters: 0, readingMinutes: 0 });
    expect(computeNoteStats(null, 200)).toMatchObject({ words: 0, characters: 0 });
  });

  it("ignores runs of whitespace rather than counting empty words", () => {
    expect(computeNoteStats("  one   two  \n\n three \n", 200).words).toBe(3);
  });

  it("rounds reading time up so a short note is never 0 minutes", () => {
    expect(computeNoteStats("one two three", 200).readingMinutes).toBe(1);
    const longNote = Array.from({ length: 450 }, () => "word").join(" ");
    expect(computeNoteStats(longNote, 200).readingMinutes).toBe(3);
  });

  it("falls back to a sane rate when the setting is misconfigured", () => {
    // A user can type 0 into the number setting; dividing by it would render
    // Infinity in the panel.
    expect(computeNoteStats("one two", 0).readingMinutes).toBe(1);
    expect(Number.isFinite(computeNoteStats("one two", Number.NaN).readingMinutes)).toBe(true);
  });
});

describe("noteStatsManifest", () => {
  it("declares relative contribution ids and matching activation events", () => {
    expect(noteStatsManifest.id).toBe("note-stats");
    expect(noteStatsManifest.contributes.panels.map((panel) => panel.id)).toEqual(["stats"]);
    expect(noteStatsManifest.contributes.commands.map((command) => command.id)).toEqual(["show"]);
    expect(noteStatsManifest.activationEvents).toContain("onView:stats");
    expect(noteStatsManifest.activationEvents).toContain("onCommand:show");
  });
});
