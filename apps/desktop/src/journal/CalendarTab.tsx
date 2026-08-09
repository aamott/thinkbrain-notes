import {
  calendarGrid,
  formatJournalDate,
  shiftCalendar,
  WEEKDAYS,
  type CalendarDay,
  type CalendarView,
  type JournalDate,
  type WeekStart
} from "@thinkbrain/core";
import { useRef, useState } from "react";

/**
 * The journal calendar, as a canvas tab (D14/D27).
 *
 * Dots only, capped at three plus `+N` (D29/D46) — the exact count always
 * reaches assistive technology even when the cell cannot show it. No value is
 * ever coloured: the vocabulary is the user's, and the app has no opinion about
 * which mood outranks which (D4).
 *
 * Presentational: a day click is reported, never acted on. Activating a day
 * filters the popout rather than opening an entry (D25) — a day with eight
 * entries has no single note to open.
 */

const MAX_DOTS = 3;

/** `3–9 August 2026` becomes `3–9 Aug 2026` where the strip is narrow (D57). */
const shortenMonths = (title: string): string =>
  title.replace(
    /January|February|March|April|May|June|July|August|September|October|November|December/g,
    (month) => month.slice(0, 3)
  );

export interface CalendarTabProps {
  readonly view: CalendarView;
  /** Any day inside the span being shown. */
  readonly focusDate: JournalDate;
  readonly weekStartsOn: WeekStart;
  readonly today: JournalDate;
  readonly selectedDay: JournalDate | null;
  /** Aggregated days, keyed by `YYYY-MM-DD`. Missing means no entries. */
  readonly days: ReadonlyMap<string, CalendarDay>;
  readonly totalShowing: number;
  readonly onViewChange: (view: CalendarView) => void;
  readonly onFocusDate: (date: JournalDate) => void;
  readonly onSelectDay: (date: JournalDate) => void;
}

const STRIP_BUTTON =
  "h-6 min-w-6 px-2 rounded-small border border-border text-muted-foreground text-xs cursor-pointer hover:text-foreground";

function DayCell({
  date,
  day,
  dimmed,
  isToday,
  isSelected,
  isFocused,
  onSelect,
  register
}: {
  readonly date: JournalDate;
  readonly day: CalendarDay | undefined;
  readonly dimmed: boolean;
  readonly isToday: boolean;
  readonly isSelected: boolean;
  readonly isFocused: boolean;
  readonly onSelect: () => void;
  readonly register: (element: HTMLButtonElement | null) => void;
}) {
  const count = day?.count ?? 0;
  const label = `${WEEKDAYS[new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()]}, ${date.day}`;

  return (
    <button
      type="button"
      ref={register}
      role="gridcell"
      // The cap is visual; the exact count is always spoken (D46).
      aria-label={`${label}, ${count} ${count === 1 ? "journal entry" : "journal entries"}`}
      aria-selected={isSelected}
      aria-current={isToday ? "date" : undefined}
      tabIndex={isFocused ? 0 : -1}
      onClick={onSelect}
      className={[
        "flex min-h-[4.4rem] flex-col gap-1 border-b border-r border-border p-1.5 text-left cursor-pointer",
        isSelected ? "bg-accent outline outline-2 -outline-offset-2 outline-ring" : "",
        isFocused ? "" : ""
      ].join(" ")}
    >
      <span
        className={
          isToday
            ? "grid h-5 w-5 place-items-center rounded-full bg-primary text-[0.7rem] font-bold text-primary-foreground tabular-nums"
            : `text-xs tabular-nums ${dimmed ? "text-muted-foreground opacity-55" : ""}`
        }
      >
        {date.day}
      </span>
      {count > 0 && (
        <span className="flex items-center gap-0.5" aria-hidden="true">
          {Array.from({ length: Math.min(count, MAX_DOTS) }, (_unused, index) => (
            <span key={index} className="h-[5px] w-[5px] rounded-full bg-primary" />
          ))}
          {count > MAX_DOTS && (
            // D57: under a 40px cell — a container under 280px — the dots stand
            // alone. Nothing is lost: the exact count is in the cell's name.
            <span className="hidden @min-[280px]:inline text-[0.62rem] text-muted-foreground tabular-nums">
              +{count - MAX_DOTS}
            </span>
          )}
        </span>
      )}
    </button>
  );
}

export function CalendarTab({
  view,
  focusDate,
  weekStartsOn,
  today,
  selectedDay,
  days,
  totalShowing,
  onViewChange,
  onFocusDate,
  onSelectDay
}: CalendarTabProps) {
  const grid = calendarGrid({ view, date: focusDate, weekStartsOn });
  const cellsRef = useRef(new Map<string, HTMLButtonElement>());
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);

  const focusKey = formatJournalDate(focusDate);
  if (pendingFocus !== null && pendingFocus !== focusKey) setPendingFocus(null);

  /** Moves the roving focus, paging the view when the target leaves it. */
  const move = (unit: "day" | "week" | "month" | "year", delta: number): void => {
    const next = shiftCalendar(focusDate, unit, delta);
    onFocusDate(next);
    const key = formatJournalDate(next);
    setPendingFocus(key);
    // The cell may not exist yet if the move paged the grid; the ref callback
    // focuses it on arrival.
    cellsRef.current.get(key)?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent): void => {
    const shift = event.shiftKey;
    const moves: Record<string, () => void> = {
      ArrowLeft: () => move("day", -1),
      ArrowRight: () => move("day", 1),
      ArrowUp: () => move("week", -1),
      ArrowDown: () => move("week", 1),
      Home: () => move("day", -((new Date(Date.UTC(focusDate.year, focusDate.month - 1, focusDate.day)).getUTCDay() - weekStartsOn + 7) % 7)),
      End: () => move("day", 6 - ((new Date(Date.UTC(focusDate.year, focusDate.month - 1, focusDate.day)).getUTCDay() - weekStartsOn + 7) % 7)),
      PageUp: () => move(shift ? "year" : "month", -1),
      PageDown: () => move(shift ? "year" : "month", 1)
    };
    const handler = moves[event.key];
    if (handler) {
      event.preventDefault();
      handler();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectDay(focusDate);
    }
  };

  const weekdayOrder = Array.from({ length: 7 }, (_unused, index) => WEEKDAYS[(index + weekStartsOn) % 7]!);

  return (
    <section className="@container flex min-h-0 flex-1 flex-col" aria-label="Journal calendar">
      <div className="flex items-center gap-2 border-b border-border bg-tab-inactive px-2.5 py-2">
        {/* One heading, two spellings: `August 2026` where it fits, `Aug 2026`
            where it does not. The grid's own name stays long either way. */}
        <h2 className="m-0 min-w-0 truncate text-[0.82rem] font-semibold tabular-nums">
          <span className="hidden @sm:inline">{grid.title}</span>
          <span className="@sm:hidden">{shortenMonths(grid.title)}</span>
        </h2>
        <div
          role="radiogroup"
          aria-label="Calendar view"
          className="flex shrink-0 overflow-hidden rounded-small border border-border"
        >
          {(["week", "month"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              // Named, not read off the glyph: D57 collapses these to `W`/`M`.
              aria-label={option === "week" ? "Week" : "Month"}
              aria-checked={view === option}
              onClick={() => onViewChange(option)}
              className={`px-2.5 py-0.5 text-xs capitalize cursor-pointer ${
                view === option
                  ? "bg-accent font-semibold text-accent-foreground"
                  : "text-muted-foreground"
              }`}
            >
              <span className="hidden @sm:inline">{option}</span>
              <span className="@sm:hidden">{option === "week" ? "W" : "M"}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex shrink-0 gap-1">
          <button type="button" aria-label="Previous" onClick={() => move(view, -1)} className={STRIP_BUTTON}>
            ‹
          </button>
          <button
            type="button"
            aria-label="Today"
            onClick={() => onFocusDate(today)}
            className={STRIP_BUTTON}
          >
            <span className="hidden @sm:inline">Today</span>
            <span className="@sm:hidden" aria-hidden="true">
              ◉
            </span>
          </button>
          <button type="button" aria-label="Next" onClick={() => move(view, 1)} className={STRIP_BUTTON}>
            ›
          </button>
        </div>
      </div>

      <div role="grid" aria-label={grid.title} className="min-h-0 flex-1 overflow-auto">
        <div role="row" className="grid grid-cols-7 border-b border-border">
          {weekdayOrder.map((weekday) => (
            <span
              key={weekday}
              role="columnheader"
              className="px-1.5 py-1 text-[0.62rem] uppercase tracking-[0.09em] text-muted-foreground"
            >
              {weekday}
            </span>
          ))}
        </div>
        <div
          className="grid grid-cols-7"
          onKeyDown={onKeyDown}
          role="rowgroup"
        >
          {grid.days.map((date) => {
            const key = formatJournalDate(date);
            return (
              <DayCell
                key={key}
                date={date}
                day={days.get(key)}
                dimmed={date.month !== grid.month}
                isToday={key === formatJournalDate(today)}
                isSelected={selectedDay !== null && key === formatJournalDate(selectedDay)}
                isFocused={key === focusKey}
                onSelect={() => onSelectDay(date)}
                register={(element) => {
                  if (element) {
                    cellsRef.current.set(key, element);
                    if (pendingFocus === key) element.focus();
                  } else {
                    cellsRef.current.delete(key);
                  }
                }}
              />
            );
          })}
        </div>
      </div>

      <p className="m-0 border-t border-border px-2.5 py-1.5 text-[0.72rem] text-muted-foreground">
        Showing {totalShowing.toLocaleString()}{" "}
        {totalShowing === 1 ? "entry" : "entries"}
        {selectedDay && ` · filtered to ${formatJournalDate(selectedDay)}`}
      </p>
    </section>
  );
}
