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
import type { JournalTroubleCode } from "./journalChrome";
import { selectJournalDay, useJournalFilter } from "./journalFilterStore";
import { JournalError, type JournalService } from "./journalService";
import { appEvents } from "../events/appEvents";

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
  /** Shell affordances the extension API does not expose yet; see D63. */
  readonly onChooseFolder?: () => void;
  readonly onOpenSettings?: () => void;
}

export function CalendarTabContainer({
  service,
  weekStartsOn = 0,
  initialView = "month",
  onViewChange,
  now = () => new Date(),
  onChooseFolder,
  onOpenSettings
}: CalendarTabContainerProps) {
  const today = toJournalDate(now());
  const [view, setView] = useState<CalendarView>(initialView);
  const [focusDate, setFocusDate] = useState<JournalDate>(today);
  const [entries, setEntries] = useState<readonly CalendarEntry[]>([]);
  // Null while the folder reads fine, which covers both "still loading" and
  // "loaded": neither draws anything the other does not.
  const [trouble, setTrouble] = useState<JournalTroubleCode | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const { selectedDay } = useJournalFilter();

  // `initialView` is now reactive (the journal extension re-reads the setting
  // via `useWatchedSetting`). Re-seed the local view when it changes. This does
  // not clobber an in-flight user navigation: the user's own view changes flow
  // through `onViewChange` and persist back to the setting, which then
  // round-trips as the same value. Adjusting state during render (with a guard)
  // is the React-recommended pattern for syncing to changing props.
  const [lastInitialView, setLastInitialView] = useState(initialView);
  if (initialView !== lastInitialView) {
    setLastInitialView(initialView);
    setView(initialView);
  }

  const read = useCallback(async (): Promise<{
    readonly trouble: JournalTroubleCode | null;
    readonly entries: readonly CalendarEntry[];
  }> => {
    try {
      const listing = await service.listEntries();
      return {
        trouble: null,
        entries: listing.entries.map((entry) => ({
          relativePath: entry.relativePath,
          ref: entry.ref,
          // Metadata filtering waits on the platform index (D41); until then the
          // calendar counts entries, which is all D29's first release shows.
          values: {}
        }))
      };
    } catch (error: unknown) {
      // The service already turned this into approved copy (D63); the tab only
      // needs to know which state to draw. Swallowing it here would draw a grid
      // of empty days, which reads as "you wrote nothing" rather than "I could
      // not look".
      return {
        trouble: error instanceof JournalError ? error.code : "unreadable",
        entries: []
      };
    }
  }, [service]);

  useEffect(() => {
    // A workspace switch can land while a read is in flight; the stale result
    // must not overwrite the newer one.
    let cancelled = false;
    void read().then((next) => {
      if (cancelled) return;
      setTrouble(next.trouble);
      setEntries(next.entries);
    });
    return () => {
      cancelled = true;
    };
  }, [read, reloadToken]);

  const reload = useCallback((): void => setReloadToken((token) => token + 1), []);

  // The calendar is a second view of a folder the user edits from elsewhere, so
  // it has to hear about writes rather than trust its mount-time read. Every
  // note goes through the workspace adapters, which announce it (D68).
  // `note.saved` is deliberately absent: editing an entry's prose changes no
  // dot, and a reload on every keystroke-triggered save would relist the folder
  // while the user types.
  useEffect(() => {
    // Not debounced. React batches the reloads that land in one task, and the
    // app has no path that writes many notes at once, so a timer would buy a
    // saving nothing can currently produce — and none of it can be pinned by a
    // test. Revisit alongside the first bulk-write feature, where the burst
    // becomes real and observable.
    const subscriptions = (["note.created", "note.deleted", "note.renamed"] as const).map(
      (event) => appEvents.on(event, reload)
    );
    return () => {
      for (const subscription of subscriptions) void subscription.dispose();
    };
  }, [reload]);

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
      trouble={trouble ?? undefined}
      onViewChange={(next) => {
        setView(next);
        onViewChange?.(next);
      }}
      onFocusDate={setFocusDate}
      onSelectDay={selectJournalDay}
      onRetry={reload}
      onChooseFolder={onChooseFolder}
      onOpenSettings={onOpenSettings}
    />
  );
}

