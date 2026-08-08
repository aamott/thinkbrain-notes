import { parseJournalFilename, UNDATED, type JournalEntryRef } from "@thinkbrain/core";
import { describe, expect, it } from "vitest";

import { buildJournalView, type JournalViewInput } from "./journalViewModel";
import type { JournalListing } from "./journalService";

const ref = (name: string): JournalEntryRef => {
  const parsed = parseJournalFilename(name);
  if (parsed === UNDATED) throw new Error(`${name} is not a dated entry`);
  return parsed;
};

const entry = (name: string) => ({ relativePath: `journal/${name}`, ref: ref(name) });

const listing = (
  names: readonly string[],
  undated: readonly { name: string; updatedAt: number }[] = []
): JournalListing => ({
  entries: names.map(entry),
  undated: undated.map((file) => ({
    relativePath: `journal/${file.name}`,
    updatedAt: file.updatedAt
  }))
});

const view = (overrides: Partial<JournalViewInput> = {}) =>
  buildJournalView({
    status: "ready",
    listing: listing([]),
    collapsed: new Set<string>(),
    selectedDay: null,
    activeFilterCount: 0,
    matchingPaths: null,
    previews: new Map<string, string>(),
    ...overrides
  });

describe("journal panel states", () => {
  it("asks for a folder when no workspace is open", () => {
    expect(view({ status: "no-workspace", listing: null }).state).toBe("no-workspace");
  });

  it("reports an invalid journal-folder setting", () => {
    expect(view({ status: "invalid-root", listing: null }).state).toBe("invalid-root");
  });

  it("reports a folder it could not read", () => {
    expect(view({ status: "unreadable", listing: null }).state).toBe("unreadable");
  });

  it("reports loading before the first listing arrives", () => {
    expect(view({ status: "loading", listing: null }).state).toBe("loading");
  });

  it("reports an empty journal folder", () => {
    expect(view().state).toBe("empty");
  });

  it("reports a filter that matches nothing, with the filter count", () => {
    const result = view({
      listing: listing(["2026-08-07-0900.md"]),
      matchingPaths: new Set<string>(),
      activeFilterCount: 3
    });

    expect(result.state).toBe("no-matches");
    expect(result.activeFilterCount).toBe(3);
  });

  it("lists entries once there are any", () => {
    expect(view({ listing: listing(["2026-08-07-0900.md"]) }).state).toBe("list");
  });
});

describe("journal list rows", () => {
  const august = listing([
    "2026-08-07-1802.md",
    "2026-08-07-0741.md",
    "2026-07-30-0900.md",
    "2025-12-31-2359.md"
  ]);

  it("groups entries under collapsible year and month headers, newest first", () => {
    const rows = view({ listing: august }).rows;

    expect(rows.map((row) => `${row.kind}:${row.key}`)).toEqual([
      "year:2026",
      "month:2026-08",
      "entry:journal/2026-08-07-1802.md",
      "entry:journal/2026-08-07-0741.md",
      "month:2026-07",
      "entry:journal/2026-07-30-0900.md",
      "year:2025",
      "month:2025-12",
      "entry:journal/2025-12-31-2359.md"
    ]);
  });

  it("hides the entries under a collapsed month but keeps the header", () => {
    const rows = view({ listing: august, collapsed: new Set(["2026-08"]) }).rows;

    expect(rows.map((row) => row.key)).toContain("2026-08");
    expect(rows.some((row) => row.key === "journal/2026-08-07-1802.md")).toBe(false);
    // The other month is untouched.
    expect(rows.some((row) => row.key === "journal/2026-07-30-0900.md")).toBe(true);
  });

  it("hides a collapsed year's months entirely", () => {
    const rows = view({ listing: august, collapsed: new Set(["2026"]) }).rows;

    expect(rows.filter((row) => row.kind === "month").map((row) => row.key)).toEqual([
      "2025-12"
    ]);
  });

  it("counts entries on every header", () => {
    const rows = view({ listing: august }).rows;
    const byKey = new Map(rows.map((row) => [row.key, row]));

    expect(byKey.get("2026")?.count).toBe(3);
    expect(byKey.get("2026-08")?.count).toBe(2);
    expect(byKey.get("2025")?.count).toBe(1);
  });

  it("pins undated files above everything, collapsed, with a count", () => {
    const rows = view({
      listing: listing(["2026-08-07-0900.md"], [{ name: "scratch.md", updatedAt: 5 }])
    }).rows;

    expect(rows[0]?.kind).toBe("undated");
    expect(rows[0]?.count).toBe(1);
    expect(rows[0]?.collapsed).toBe(true);
  });

  it("omits the undated group when there are no undated files", () => {
    const rows = view({ listing: listing(["2026-08-07-0900.md"]) }).rows;

    expect(rows.some((row) => row.kind === "undated")).toBe(false);
  });

  it("lists undated files newest-modified first when expanded", () => {
    const rows = view({
      listing: listing(
        [],
        [
          { name: "older.md", updatedAt: 10 },
          { name: "newer.md", updatedAt: 99 }
        ]
      ),
      collapsed: new Set<string>()
    }).rows;

    // The group is collapsed by default, so expanding means it is *not* listed
    // in the collapsed set — the panel toggles it in.
    const expanded = buildJournalView({
      status: "ready",
      listing: listing(
        [],
        [
          { name: "older.md", updatedAt: 10 },
          { name: "newer.md", updatedAt: 99 }
        ]
      ),
      collapsed: new Set<string>(),
      selectedDay: null,
      activeFilterCount: 0,
      matchingPaths: null,
      previews: new Map(),
      expandedUndated: true
    }).rows;

    expect(rows.filter((row) => row.kind === "undated-entry")).toHaveLength(0);
    expect(expanded.filter((row) => row.kind === "undated-entry").map((row) => row.key)).toEqual([
      "journal/newer.md",
      "journal/older.md"
    ]);
  });

  it("carries the entry's date, time and lazily loaded preview", () => {
    const rows = view({
      listing: listing(["2026-08-07-1802.md"]),
      previews: new Map([["journal/2026-08-07-1802.md", "Bread needed more salt."]])
    }).rows;
    const row = rows.find((candidate) => candidate.kind === "entry");

    expect(row?.dateLabel).toBe("Fri 7");
    expect(row?.timeLabel).toBe("6:02 PM");
    expect(row?.preview).toBe("Bread needed more salt.");
  });

  it("leaves the preview absent until it is loaded, without blocking the row", () => {
    const row = view({ listing: listing(["2026-08-07-1802.md"]) }).rows.find(
      (candidate) => candidate.kind === "entry"
    );

    expect(row?.dateLabel).toBe("Fri 7");
    expect(row?.preview).toBeNull();
  });

  it("shows no time for a date-only entry", () => {
    const row = view({ listing: listing(["2026-08-07.md"]) }).rows.find(
      (candidate) => candidate.kind === "entry"
    );

    expect(row?.timeLabel).toBeNull();
  });
});

describe("filtering (D25, D52)", () => {
  const entries = listing([
    "2026-08-07-1802.md",
    "2026-08-05-1307.md",
    "2026-03-14-1120.md"
  ]);

  it("keeps only the day the calendar selected", () => {
    const result = view({
      listing: entries,
      selectedDay: { year: 2026, month: 8, day: 5 },
      activeFilterCount: 1
    });

    expect(result.rows.filter((row) => row.kind === "entry").map((row) => row.key)).toEqual([
      "journal/2026-08-05-1307.md"
    ]);
    expect(result.showing).toBe(1);
    expect(result.total).toBe(3);
  });

  it("keeps only the paths the index matched", () => {
    const result = view({
      listing: entries,
      matchingPaths: new Set(["journal/2026-03-14-1120.md"]),
      activeFilterCount: 1
    });

    expect(result.rows.filter((row) => row.kind === "entry").map((row) => row.key)).toEqual([
      "journal/2026-03-14-1120.md"
    ]);
  });

  it("requires an entry to satisfy the day and the index together", () => {
    const result = view({
      listing: entries,
      selectedDay: { year: 2026, month: 8, day: 5 },
      matchingPaths: new Set(["journal/2026-03-14-1120.md"]),
      activeFilterCount: 2
    });

    expect(result.state).toBe("no-matches");
  });

  it("expands a header that contains matches and reports the match count", () => {
    // A collapsed header hiding a match would be a defect (D52).
    const result = view({
      listing: entries,
      collapsed: new Set(["2026", "2026-03"]),
      matchingPaths: new Set(["journal/2026-03-14-1120.md"]),
      activeFilterCount: 1
    });
    const byKey = new Map(result.rows.map((row) => [row.key, row]));

    expect(byKey.get("2026")?.collapsed).toBe(false);
    expect(byKey.get("2026-03")?.matchCount).toBe(1);
    expect(result.rows.some((row) => row.key === "journal/2026-03-14-1120.md")).toBe(true);
  });

  it("reports no match count when nothing is being filtered", () => {
    const byKey = new Map(view({ listing: entries }).rows.map((row) => [row.key, row]));

    expect(byKey.get("2026")?.matchCount).toBeNull();
  });

  it("counts undated files out of the total but keeps them reachable", () => {
    const result = view({
      listing: listing(["2026-08-07-0900.md"], [{ name: "scratch.md", updatedAt: 1 }])
    });

    // The count that matters to a person is entries, not stray files.
    expect(result.total).toBe(1);
    expect(result.rows[0]?.count).toBe(1);
  });
});
