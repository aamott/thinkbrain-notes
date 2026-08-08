import { describe, expect, it } from "vitest";

import { journalEntryFolder, resolveNewEntryPath } from "./paths";

const date = { year: 2026, month: 8, day: 7 };

describe("journalEntryFolder", () => {
  it("nests by year and zero-padded month under the configured root", () => {
    expect(journalEntryFolder("journal", date)).toBe("journal/2026/08");
  });

  it("honours a nested or renamed root", () => {
    expect(journalEntryFolder("notes/diary", { year: 2026, month: 1, day: 2 })).toBe(
      "notes/diary/2026/01"
    );
  });

  it("tolerates a root with a trailing separator", () => {
    expect(journalEntryFolder("journal/", date)).toBe("journal/2026/08");
  });
});

describe("resolveNewEntryPath", () => {
  const resolve = (taken: readonly string[], minuteOfDay = 13 * 60 + 7) =>
    resolveNewEntryPath({ root: "journal", date, minuteOfDay, taken });

  it("writes D17's timed form when nothing collides", () => {
    expect(resolve([])).toBe("journal/2026/08/2026-08-07-1307.md");
  });

  it("adds a counter of 2 on the first same-minute collision", () => {
    expect(resolve(["journal/2026/08/2026-08-07-1307.md"])).toBe(
      "journal/2026/08/2026-08-07-1307-2.md"
    );
  });

  it("keeps counting past the first counter", () => {
    expect(
      resolve([
        "journal/2026/08/2026-08-07-1307.md",
        "journal/2026/08/2026-08-07-1307-2.md",
        "journal/2026/08/2026-08-07-1307-3.md"
      ])
    ).toBe("journal/2026/08/2026-08-07-1307-4.md");
  });

  it("fills a gap left by a deleted counter rather than skipping it", () => {
    expect(
      resolve([
        "journal/2026/08/2026-08-07-1307.md",
        "journal/2026/08/2026-08-07-1307-3.md"
      ])
    ).toBe("journal/2026/08/2026-08-07-1307-2.md");
  });

  it("ignores entries from another minute or another day", () => {
    expect(
      resolve([
        "journal/2026/08/2026-08-07-1308.md",
        "journal/2026/08/2026-08-06-1307.md"
      ])
    ).toBe("journal/2026/08/2026-08-07-1307.md");
  });

  it("zero-pads a time before ten", () => {
    expect(resolve([], 9 * 60 + 5)).toBe("journal/2026/08/2026-08-07-0905.md");
  });

  it("writes midnight as 0000 rather than omitting the time", () => {
    expect(resolve([], 0)).toBe("journal/2026/08/2026-08-07-0000.md");
  });

  it("rejects a minute outside the day", () => {
    expect(() => resolve([], 24 * 60)).toThrow(/minute of day/i);
    expect(() => resolve([], -1)).toThrow(/minute of day/i);
  });

  it("rejects a root that escapes the workspace", () => {
    expect(() =>
      resolveNewEntryPath({ root: "../outside", date, minuteOfDay: 0, taken: [] })
    ).toThrow(/inside the workspace/i);
  });
});
