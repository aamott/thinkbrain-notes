import { describe, expect, it } from "vitest";

import { calendarGrid, shiftCalendar, type CalendarView } from "./calendarGrid";
import type { JournalDate } from "./types";

const date = (iso: string): JournalDate => {
  const [year, month, day] = iso.split("-").map(Number);
  return { year: year!, month: month!, day: day! };
};

const iso = ({ year, month, day }: JournalDate): string =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const grid = (view: CalendarView, on: string, weekStartsOn: 0 | 1 = 0) =>
  calendarGrid({ view, date: date(on), weekStartsOn });

describe("month grid", () => {
  it("starts on the week containing the first and ends on the week containing the last", () => {
    // August 2026 starts on a Saturday and ends on a Monday.
    const result = grid("month", "2026-08-12");

    expect(iso(result.days[0]!)).toBe("2026-07-26");
    expect(iso(result.days.at(-1)!)).toBe("2026-09-05");
    expect(result.days.length % 7).toBe(0);
  });

  it("respects a Monday week start", () => {
    const result = grid("month", "2026-08-12", 1);

    expect(iso(result.days[0]!)).toBe("2026-07-27");
    expect(result.days.length % 7).toBe(0);
  });

  it("covers every day of the month it is showing", () => {
    const shown = new Set(grid("month", "2026-08-12").days.map(iso));

    for (let day = 1; day <= 31; day += 1) {
      expect(shown.has(`2026-08-${String(day).padStart(2, "0")}`)).toBe(true);
    }
  });

  it("handles a leap February", () => {
    const result = grid("month", "2028-02-10");

    expect(result.days.filter((day) => day.month === 2).map(iso)).toContain("2028-02-29");
  });

  it("reports the range it needs aggregating over", () => {
    const result = grid("month", "2026-08-12");

    expect(iso(result.range.start)).toBe(iso(result.days[0]!));
    expect(iso(result.range.end)).toBe(iso(result.days.at(-1)!));
  });

  it("titles itself by the month it is showing, not the day", () => {
    expect(grid("month", "2026-08-12").title).toBe("August 2026");
  });
});

describe("week grid", () => {
  it("shows the seven days around the date", () => {
    const result = grid("week", "2026-08-07");

    expect(result.days.map(iso)).toEqual([
      "2026-08-02",
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
      "2026-08-08"
    ]);
  });

  it("crosses a month boundary without losing a day", () => {
    const result = grid("week", "2026-09-01");

    expect(result.days.map(iso)[0]).toBe("2026-08-30");
    expect(result.days).toHaveLength(7);
  });

  it("names the span, including when it crosses months", () => {
    expect(grid("week", "2026-08-07").title).toBe("2–8 August 2026");
    expect(grid("week", "2026-09-01").title).toBe("30 August – 5 September 2026");
  });
});

describe("moving around", () => {
  it("pages by month, keeping a day that exists in the target", () => {
    expect(iso(shiftCalendar(date("2026-08-12"), "month", 1))).toBe("2026-09-12");
    expect(iso(shiftCalendar(date("2026-08-12"), "month", -1))).toBe("2026-07-12");
  });

  it("clamps to the last day when the target month is shorter", () => {
    // From 31 January, a month forward is the end of February, not 3 March.
    expect(iso(shiftCalendar(date("2026-01-31"), "month", 1))).toBe("2026-02-28");
    expect(iso(shiftCalendar(date("2028-01-31"), "month", 1))).toBe("2028-02-29");
  });

  it("pages by year, clamping a leap day", () => {
    expect(iso(shiftCalendar(date("2028-02-29"), "year", 1))).toBe("2029-02-28");
  });

  it("moves by day and by week across boundaries", () => {
    expect(iso(shiftCalendar(date("2026-12-31"), "day", 1))).toBe("2027-01-01");
    expect(iso(shiftCalendar(date("2026-08-07"), "week", -1))).toBe("2026-07-31");
  });
});
