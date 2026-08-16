import { describe, expect, it } from "vitest";

import { UNDATED, compareJournalEntries, parseJournalFilename } from "./filename";
import type { JournalEntryRef } from "./types";

/**
 * D42 fixes the accepted filename family. Everything outside it is UNDATED —
 * the app never guesses a date (D38), because a wrong guess silently misfiles
 * the entry.
 */

const ref = (filename: string): JournalEntryRef => {
  const result = parseJournalFilename(filename);
  if (result === UNDATED) throw new Error(`expected ${filename} to parse`);
  return result;
};

describe("parseJournalFilename", () => {
  it("parses a date-only entry with unknown time", () => {
    expect(ref("2026-08-07.md")).toEqual({
      date: { year: 2026, month: 8, day: 7 },
      minuteOfDay: null,
      counter: null
    });
  });

  it("parses a timed entry", () => {
    expect(ref("2026-08-07-1307.md")).toEqual({
      date: { year: 2026, month: 8, day: 7 },
      minuteOfDay: 13 * 60 + 7,
      counter: null
    });
  });

  it("parses a same-minute counter without reading it as time", () => {
    const parsed = ref("2026-08-07-1307-2.md");
    expect(parsed.minuteOfDay).toBe(13 * 60 + 7);
    expect(parsed.counter).toBe(2);
  });

  it("accepts midnight and the last minute of the day", () => {
    expect(ref("2026-08-07-0000.md").minuteOfDay).toBe(0);
    expect(ref("2026-08-07-2359.md").minuteOfDay).toBe(23 * 60 + 59);
  });

  it.each([
    ["day-first", "01-02-2026.md"],
    ["underscore separators", "2026_08_07.md"],
    ["ISO T form", "2026-08-07T1307.md"],
    ["an invalid calendar date", "2026-02-30.md"],
    ["an invalid month", "2026-13-07.md"],
    ["missing zero padding", "2026-8-7.md"],
    ["a counter of 1", "2026-08-07-1307-1.md"],
    ["a counter of 0", "2026-08-07-1307-0.md"],
    ["a date-only counter", "2026-08-07-2.md"],
    ["an hour past 23", "2026-08-07-2400.md"],
    ["a minute past 59", "2026-08-07-1360.md"],
    ["a month name", "2026-Aug-07.md"],
    ["a trailing suffix", "2026-08-07-1307-draft.md"],
    ["a non-Markdown extension", "2026-08-07.txt"],
    ["no extension", "2026-08-07"],
    ["an empty name", ""]
  ])("treats %s as undated", (_label, filename) => {
    expect(parseJournalFilename(filename)).toBe(UNDATED);
  });

  it("accepts a leap day and rejects one in a common year", () => {
    expect(parseJournalFilename("2028-02-29.md")).not.toBe(UNDATED);
    expect(parseJournalFilename("2026-02-29.md")).toBe(UNDATED);
  });

  it("ignores any directory prefix", () => {
    expect(ref("journal/2026/08/2026-08-07-1307.md").minuteOfDay).toBe(13 * 60 + 7);
  });
});

describe("compareJournalEntries", () => {
  it("sorts a date-only entry before timed entries on the same day", () => {
    const dateOnly = ref("2026-08-07.md");
    const timed = ref("2026-08-07-0000.md");

    expect(compareJournalEntries(dateOnly, timed)).toBeLessThan(0);
  });

  it("sorts chronologically across days, times, and counters", () => {
    const sorted = [
      "2026-08-07-1307-3.md",
      "2026-08-06-2359.md",
      "2026-08-07.md",
      "2026-08-07-1307.md",
      "2026-08-07-1307-2.md"
    ]
      .map(ref)
      .sort(compareJournalEntries);

    expect(sorted.map((entry) => [entry.date.day, entry.minuteOfDay, entry.counter])).toEqual([
      [6, 23 * 60 + 59, null],
      [7, null, null],
      [7, 13 * 60 + 7, null],
      [7, 13 * 60 + 7, 2],
      [7, 13 * 60 + 7, 3]
    ]);
  });
});
