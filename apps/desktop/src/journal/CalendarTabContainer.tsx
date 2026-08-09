import {
  aggregateCalendarDays,
  calendarGrid,
  formatJournalDate,
  toJournalDate,
  type CalendarDay,
  type CalendarEntry,
  type CalendarView,
  type JournalDate,
  type WeekStart
} from "@thinkbrain/core";
import { useCallback, useEffect, useState } from "react";

import { CalendarTab } from "./CalendarTab";
import { selectJournalDay, useJournalFilter } from "./journalFilterStore";
import type { JournalService } from "./journalService";

/**
 * Feeds the calendar from the journal folder.
 *
 * The view mode persists; the date does not — the tab always opens on today's
 * month, because the month you last browsed to is an accident of browsing (D79).
 */

export interface CalendarTabContainerProps {
  readonly service: JournalService;
  readonly weekStartsOn?: WeekStart;
  /** Persisted per workspace (D56); absent falls back to the D64 default. */
  readonly initialView?: CalendarView;
  readonly onViewChange?: (view: CalendarView) => void;
  readonly now?: () => Date;
}

export function CalendarTabContainer({
  service,
  weekStartsOn = 0,
  initialView = "month",
  onViewChange,
  now = () => new Date()
}: CalendarTabContainerProps) {
  const today = toJournalDate(now());
  const [view, setView] = useState<CalendarView>(initialView);
  const [focusDate, setFocusDate] = useState<JournalDate>(today);
  const [entries, setEntries] = useState<readonly CalendarEntry[]>([]);
  const { selectedDay } = useJournalFilter();

  const read = useCallback(async (): Promise<readonly CalendarEntry[]> => {
    try {
      const listing = await service.listEntries();
      return listing.entries.map((entry) => ({
        relativePath: entry.relativePath,
        ref: entry.ref,
        // Metadata filtering waits on the platform index (D41); until then the
        // calendar counts entries, which is all D29's first release shows.
        values: {}
      }));
    } catch {
      return [];
    }
  }, [service]);

  useEffect(() => {
    let cancelled = false;
    void read().then((next) => {
      if (!cancelled) setEntries(next);
    });
    return () => {
      cancelled = true;
    };
  }, [read]);

  const grid = calendarGrid({ view, date: focusDate, weekStartsOn });
  const aggregate = aggregateCalendarDays(entries, grid.range, {
    // The selected day is what the popout lists, not what the grid draws: a
    // calendar that hid every other day would be useless for picking one.
    selectedDay: null,
    predicates: []
  });

  const days = new Map<string, CalendarDay>(
    aggregate.days
      .filter((day) => day.count > 0)
      .map((day) => [formatJournalDate(day.date), day])
  );

  return (
    <CalendarTab
      view={view}
      focusDate={focusDate}
      weekStartsOn={weekStartsOn}
      today={today}
      selectedDay={selectedDay}
      days={days}
      totalShowing={entries.length}
      onViewChange={(next) => {
        setView(next);
        onViewChange?.(next);
      }}
      onFocusDate={setFocusDate}
      onSelectDay={selectJournalDay}
    />
  );
}

