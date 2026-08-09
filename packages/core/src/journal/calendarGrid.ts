import type { CalendarRange } from "./calendar";
import type { JournalDate } from "./types";

/**
 * The days a calendar view draws, and how paging moves between them.
 *
 * Pure calendar arithmetic on `Date.UTC`, which is arithmetic here rather than
 * a conversion: these are calendar labels, and no timezone may shift them (D19).
 */

export type CalendarView = "week" | "month";

/** 0 = Sunday, 1 = Monday. Resolved from the D64 setting by the caller. */
export type WeekStart = 0 | 1;

export interface CalendarGridInput {
  readonly view: CalendarView;
  /** Any day inside the span to draw. */
  readonly date: JournalDate;
  readonly weekStartsOn: WeekStart;
}

export interface CalendarGrid {
  /** Every cell, in reading order; always a whole number of weeks. */
  readonly days: readonly JournalDate[];
  /** The span to aggregate over — the grid's first and last day. */
  readonly range: CalendarRange;
  /** The month the view is about; other days are shown dimmed. */
  readonly month: number;
  readonly year: number;
  readonly title: string;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
] as const;

const toUtc = (date: JournalDate): Date =>
  new Date(Date.UTC(date.year, date.month - 1, date.day));

const fromUtc = (value: Date): JournalDate => ({
  year: value.getUTCFullYear(),
  month: value.getUTCMonth() + 1,
  day: value.getUTCDate()
});

const daysInMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

function addDays(date: JournalDate, delta: number): JournalDate {
  const value = toUtc(date);
  value.setUTCDate(value.getUTCDate() + delta);
  return fromUtc(value);
}

/** Steps whole months, keeping the day where the target month has one. */
function addMonths(date: JournalDate, delta: number): JournalDate {
  const total = date.year * 12 + (date.month - 1) + delta;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  // 31 January plus a month is the end of February, not the 3rd of March.
  return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}

export function shiftCalendar(
  date: JournalDate,
  unit: "day" | "week" | "month" | "year",
  delta: number
): JournalDate {
  switch (unit) {
    case "day":
      return addDays(date, delta);
    case "week":
      return addDays(date, delta * 7);
    case "month":
      return addMonths(date, delta);
    case "year":
      return addMonths(date, delta * 12);
  }
}

/** Walks back to the week's first day for the configured week start. */
function startOfWeek(date: JournalDate, weekStartsOn: WeekStart): JournalDate {
  const weekday = toUtc(date).getUTCDay();
  return addDays(date, -((weekday - weekStartsOn + 7) % 7));
}

function formatWeekTitle(first: JournalDate, last: JournalDate): string {
  if (first.month === last.month && first.year === last.year) {
    return `${first.day}–${last.day} ${MONTHS[first.month - 1]} ${first.year}`;
  }
  const start = `${first.day} ${MONTHS[first.month - 1]}`;
  const end = `${last.day} ${MONTHS[last.month - 1]} ${last.year}`;
  return first.year === last.year ? `${start} – ${end}` : `${start} ${first.year} – ${end}`;
}

export function calendarGrid({ view, date, weekStartsOn }: CalendarGridInput): CalendarGrid {
  const first =
    view === "week"
      ? startOfWeek(date, weekStartsOn)
      : startOfWeek({ ...date, day: 1 }, weekStartsOn);

  const cells =
    view === "week"
      ? 7
      : // Whole weeks covering the month: enough rows for the last day to land.
        Math.ceil(
          (((toUtc({ ...date, day: daysInMonth(date.year, date.month) }).getTime() -
            toUtc(first).getTime()) /
            86_400_000) +
            1) / 7
        ) * 7;

  const days = Array.from({ length: cells }, (_unused, index) => addDays(first, index));
  const last = days.at(-1)!;

  return {
    days,
    range: { start: first, end: last },
    month: date.month,
    year: date.year,
    title:
      view === "week"
        ? formatWeekTitle(first, last)
        : `${MONTHS[date.month - 1]} ${date.year}`
  };
}
