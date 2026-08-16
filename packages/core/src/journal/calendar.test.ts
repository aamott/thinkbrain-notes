import { describe, expect, it } from "vitest";

import {
  aggregateCalendarDays,
  filterEntriesByDay,
  filterEntries,
  type CalendarEntry,
  type CalendarFilter,
  type CalendarRange
} from "./calendar";
import { parseJournalFilename } from "./filename";
import type { JournalDate, JournalFieldValue } from "./types";

/** Builds an entry the way the app does: the real parser reads the filename. */
const entry = (
  path: string,
  values: Readonly<Record<string, JournalFieldValue>> = {}
): CalendarEntry => ({
  relativePath: `journal/${path}`,
  ref: parseJournalFilename(path),
  values
});

const date = (iso: string): JournalDate => {
  const [year, month, day] = iso.split("-").map(Number);
  return { year: year!, month: month!, day: day! };
};

const range = (start: string, end: string): CalendarRange => ({
  start: date(start),
  end: date(end)
});

const NO_FILTER: CalendarFilter = { selectedDay: null, predicates: [] };

const august = range("2026-08-01", "2026-08-31");

const dayOf = (
  result: ReturnType<typeof aggregateCalendarDays>,
  iso: string
): (typeof result.days)[number] => {
  const found = result.days.find(
    (candidate) =>
      candidate.date.year === date(iso).year &&
      candidate.date.month === date(iso).month &&
      candidate.date.day === date(iso).day
  );
  if (!found) throw new Error(`No day ${iso} in the result.`);
  return found;
};

describe("aggregateCalendarDays", () => {
  it("covers every day in the range, inclusive of both ends", () => {
    const result = aggregateCalendarDays([], august, NO_FILTER);

    expect(result.days).toHaveLength(31);
    expect(result.days[0]?.date).toEqual(date("2026-08-01"));
    expect(result.days.at(-1)?.date).toEqual(date("2026-08-31"));
  });

  it("reports a day with no entries as empty and countless", () => {
    const day = dayOf(aggregateCalendarDays([], august, NO_FILTER), "2026-08-07");

    expect(day.state).toBe("empty");
    expect(day.count).toBe(0);
    expect(day.visibleDots).toBe(0);
    expect(day.overflow).toBe(0);
    expect(day.entries).toEqual([]);
  });

  it("places an entry on the day its filename names", () => {
    const note = entry("2026-08-07-0900.md");
    const day = dayOf(aggregateCalendarDays([note], august, NO_FILTER), "2026-08-07");

    expect(day.state).toBe("has-entries");
    expect(day.count).toBe(1);
    expect(day.entries).toEqual([note]);
  });

  it("ignores entries outside the range", () => {
    const result = aggregateCalendarDays(
      [entry("2026-07-31-0900.md"), entry("2026-09-01-0900.md")],
      august,
      NO_FILTER
    );

    expect(result.days.every((day) => day.count === 0)).toBe(true);
  });

  it("orders a day's entries chronologically", () => {
    const evening = entry("2026-08-07-1800.md");
    const morning = entry("2026-08-07-0900.md");
    const dateOnly = entry("2026-08-07.md");

    const day = dayOf(
      aggregateCalendarDays([evening, morning, dateOnly], august, NO_FILTER),
      "2026-08-07"
    );

    expect(day.entries.map((found) => found.relativePath)).toEqual([
      dateOnly.relativePath,
      morning.relativePath,
      evening.relativePath
    ]);
  });
});

describe("entry density (D46)", () => {
  const entriesOn = (count: number): CalendarEntry[] =>
    Array.from({ length: count }, (_unused, index) =>
      entry(`2026-08-07-${String(9 + index).padStart(2, "0")}00.md`)
    );

  it.each([
    [0, 0, 0],
    [1, 1, 0],
    [3, 3, 0],
    [4, 3, 1],
    [8, 3, 5]
  ])("shows %i entries as %i dots plus %i more", (count, dots, overflow) => {
    const day = dayOf(
      aggregateCalendarDays(entriesOn(count), august, NO_FILTER),
      "2026-08-07"
    );

    // The exact count is what accessible text reports; the cap is visual only.
    expect(day.count).toBe(count);
    expect(day.visibleDots).toBe(dots);
    expect(day.overflow).toBe(overflow);
  });
});

describe("per-day value summaries (D43)", () => {
  it("preserves every distinct value across a day's entries", () => {
    const result = aggregateCalendarDays(
      [
        entry("2026-08-07-0900.md", { context: ["running", "outdoors"], energy: 7 }),
        entry("2026-08-07-1800.md", { context: ["reading"], energy: 4 })
      ],
      august,
      NO_FILTER
    );

    const day = dayOf(result, "2026-08-07");
    expect(day.values.context).toEqual(["running", "outdoors", "reading"]);
    // Not the later entry, and not an average.
    expect(day.values.energy).toEqual([7, 4]);
  });

  it("records a value shared by two entries once", () => {
    const day = dayOf(
      aggregateCalendarDays(
        [
          entry("2026-08-07-0900.md", { context: ["running"] }),
          entry("2026-08-07-1800.md", { context: ["running"] })
        ],
        august,
        NO_FILTER
      ),
      "2026-08-07"
    );

    expect(day.values.context).toEqual(["running"]);
  });

  it("summarises fields it has never heard of", () => {
    // The model is given values, not definitions: an unknown key is a user's
    // key, and dropping it would hide their own data from their own calendar.
    const day = dayOf(
      aggregateCalendarDays(
        [entry("2026-08-07-0900.md", { "some-other-tool": "kept" })],
        august,
        NO_FILTER
      ),
      "2026-08-07"
    );

    expect(day.values["some-other-tool"]).toEqual(["kept"]);
  });

  it("counts an entry whose frontmatter yielded no readable values", () => {
    const day = dayOf(
      aggregateCalendarDays([entry("2026-08-07-0900.md")], august, NO_FILTER),
      "2026-08-07"
    );

    expect(day.count).toBe(1);
    expect(day.values).toEqual({});
  });
});

describe("filters (D43)", () => {
  const morning = entry("2026-08-07-0900.md", { context: ["running"], energy: 7 });
  const evening = entry("2026-08-07-1800.md", { context: ["reading"], energy: 4 });
  const entries = [morning, evening];

  const withPredicates = (
    predicates: CalendarFilter["predicates"]
  ): CalendarFilter => ({ selectedDay: null, predicates });

  it("qualifies a day only when one entry satisfies every predicate", () => {
    const filter = withPredicates([
      { field: "context", values: ["running"] },
      { field: "energy", values: [4] }
    ]);

    const day = dayOf(aggregateCalendarDays(entries, august, filter), "2026-08-07");

    // Both values occur on this day, but never in the same entry.
    expect(day.state).toBe("empty");
    expect(day.count).toBe(0);
  });

  it("counts only the matching entries when a day qualifies", () => {
    const filter = withPredicates([
      { field: "context", values: ["running"] },
      { field: "energy", values: [7] }
    ]);

    const day = dayOf(aggregateCalendarDays(entries, august, filter), "2026-08-07");

    expect(day.count).toBe(1);
    expect(day.entries).toEqual([morning]);
    expect(day.values.context).toEqual(["running"]);
  });

  it("accepts any of a field's selected values", () => {
    const filter = withPredicates([{ field: "context", values: ["running", "reading"] }]);

    const day = dayOf(aggregateCalendarDays(entries, august, filter), "2026-08-07");

    expect(day.count).toBe(2);
  });

  it("excludes an entry that does not carry the filtered field at all", () => {
    const filter = withPredicates([{ field: "context", values: ["running"] }]);

    const day = dayOf(
      aggregateCalendarDays([entry("2026-08-07-0900.md")], august, filter),
      "2026-08-07"
    );

    expect(day.count).toBe(0);
  });

  it("matches a scalar value as well as a list", () => {
    const filter = withPredicates([{ field: "context", values: ["running"] }]);

    const day = dayOf(
      aggregateCalendarDays(
        [entry("2026-08-07-0900.md", { context: "running" })],
        august,
        filter
      ),
      "2026-08-07"
    );

    expect(day.count).toBe(1);
  });

  it("leaves the grid intact when a day is selected", () => {
    // Selection drives the popout, not which days the calendar draws (D25/D59).
    const filter: CalendarFilter = { selectedDay: date("2026-08-07"), predicates: [] };

    const result = aggregateCalendarDays(entries, august, filter);

    expect(result.days).toHaveLength(31);
    expect(dayOf(result, "2026-08-07").count).toBe(2);
  });
});

describe("undated entries (D36/D38)", () => {
  const undated = entry("thoughts.md", { context: ["reading"] });

  it("keeps an undated entry out of every day cell and reports it separately", () => {
    const result = aggregateCalendarDays(
      [undated, entry("2026-08-07-0900.md")],
      august,
      NO_FILTER
    );

    expect(result.days.reduce((total, day) => total + day.count, 0)).toBe(1);
    expect(result.undated).toEqual([undated]);
  });

  it("applies the active filters to undated entries too", () => {
    const filter: CalendarFilter = {
      selectedDay: null,
      predicates: [{ field: "context", values: ["running"] }]
    };

    const result = aggregateCalendarDays([undated], august, filter);

    expect(result.undated).toEqual([]);
  });
});

describe("calendar boundaries", () => {
  it("enumerates a leap February", () => {
    const result = aggregateCalendarDays([], range("2028-02-01", "2028-02-29"), NO_FILTER);

    expect(result.days).toHaveLength(29);
    expect(result.days.at(-1)?.date).toEqual(date("2028-02-29"));
  });

  it("enumerates a common February", () => {
    const result = aggregateCalendarDays([], range("2026-02-01", "2026-02-28"), NO_FILTER);

    expect(result.days).toHaveLength(28);
  });

  it("crosses a year boundary", () => {
    const result = aggregateCalendarDays(
      [entry("2025-12-31-2359.md"), entry("2026-01-01-0000.md")],
      range("2025-12-28", "2026-01-03"),
      NO_FILTER
    );

    expect(result.days).toHaveLength(7);
    // Midnight and one minute to midnight stay on their own dates: the model
    // reads calendar labels and never converts through a timestamp (D19).
    expect(dayOf(result, "2025-12-31").count).toBe(1);
    expect(dayOf(result, "2026-01-01").count).toBe(1);
  });

  it("returns no days when the range runs backwards", () => {
    const result = aggregateCalendarDays([], range("2026-08-31", "2026-08-01"), NO_FILTER);

    expect(result.days).toEqual([]);
  });

  it("returns a single day for a one-day range", () => {
    const result = aggregateCalendarDays([], range("2026-08-07", "2026-08-07"), NO_FILTER);

    expect(result.days).toHaveLength(1);
  });
});

describe("loading and error states", () => {
  it("marks every day loading while the folder is being read", () => {
    const result = aggregateCalendarDays([], august, NO_FILTER, "loading");

    expect(result.status).toBe("loading");
    expect(result.days.every((day) => day.state === "loading")).toBe(true);
  });

  it("marks every day as an error when the folder could not be read", () => {
    const result = aggregateCalendarDays([], august, NO_FILTER, "error");

    expect(result.days.every((day) => day.state === "error")).toBe(true);
  });

  it("is ready by default", () => {
    expect(aggregateCalendarDays([], august, NO_FILTER).status).toBe("ready");
  });
});

describe("diagnostics", () => {
  it("surfaces an entry's diagnostics on the day it belongs to", () => {
    const note: CalendarEntry = {
      ...entry("2026-08-07-0900.md"),
      diagnostics: [
        { code: "journal_date_mismatch", message: "The date disagrees.", severity: "warning" }
      ]
    };

    const day = dayOf(aggregateCalendarDays([note], august, NO_FILTER), "2026-08-07");

    expect(day.diagnostics.map((found) => found.code)).toEqual(["journal_date_mismatch"]);
  });
});

describe("purity", () => {
  it("derives the same result from the same entries every time", () => {
    const entries = [
      entry("2026-08-07-0900.md", { energy: 7 }),
      entry("2026-08-09-1800.md", { energy: 4 })
    ];

    expect(aggregateCalendarDays(entries, august, NO_FILTER)).toEqual(
      aggregateCalendarDays(entries, august, NO_FILTER)
    );
  });

  it("does not touch the entries it is given", () => {
    // Loading and filtering read; they never write (D33). Frozen input proves
    // the model has nowhere to stash derived state.
    const note = Object.freeze(entry("2026-08-07-0900.md", Object.freeze({ energy: 7 })));
    const entries = Object.freeze([note]);

    expect(() => aggregateCalendarDays(entries, august, NO_FILTER)).not.toThrow();
    expect(entries).toEqual([note]);
  });
});

describe("filterEntriesByDay", () => {
  const morning = entry("2026-08-07-0900.md");
  const evening = entry("2026-08-07-1800.md");
  const other = entry("2026-08-08-0900.md");
  const undated = entry("thoughts.md");

  it("returns the day's entries chronologically", () => {
    expect(filterEntriesByDay([evening, other, morning, undated], date("2026-08-07"))).toEqual([
      morning,
      evening
    ]);
  });

  it("returns nothing for a day with no entries", () => {
    expect(filterEntriesByDay([other], date("2026-08-07"))).toEqual([]);
  });
});

describe("filterEntries", () => {
  const morning = entry("2026-08-07-0900.md", { context: ["running"] });
  const evening = entry("2026-08-07-1800.md", { context: ["reading"] });
  const nextDay = entry("2026-08-08-0900.md", { context: ["running"] });
  const entries = [morning, evening, nextDay];

  it("applies the predicates alone when no day is selected", () => {
    const filter: CalendarFilter = {
      selectedDay: null,
      predicates: [{ field: "context", values: ["running"] }]
    };

    expect(filterEntries(entries, filter)).toEqual([morning, nextDay]);
  });

  it("narrows to the selected day as well", () => {
    // The day chip and the metadata chips clear independently (D60), so each
    // one has to stand on its own here.
    const filter: CalendarFilter = {
      selectedDay: date("2026-08-07"),
      predicates: [{ field: "context", values: ["running"] }]
    };

    expect(filterEntries(entries, filter)).toEqual([morning]);
  });

  it("returns everything when nothing is filtered", () => {
    expect(filterEntries(entries, NO_FILTER)).toEqual(entries);
  });
});
