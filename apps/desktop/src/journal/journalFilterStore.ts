import { create } from "zustand";
import { formatJournalDate, type JournalDate } from "@thinkbrain/core";

/**
 * The filter the popout and the calendar share (D25).
 *
 * One store rather than two states that agree by convention: a day picked on
 * the calendar and the chip shown in the popout are the same fact, and the two
 * surfaces are rendered in different trees.
 */

export interface JournalFilterState {
  readonly selectedDay: JournalDate | null;
}

const EMPTY: JournalFilterState = Object.freeze({ selectedDay: null });

const useJournalFilterStore = create<JournalFilterState>(() => EMPTY);

export function getJournalFilter(): JournalFilterState {
  return useJournalFilterStore.getState();
}

/** Selecting the day already selected clears it, so a click toggles (D60). */
export function selectJournalDay(day: JournalDate | null): void {
  const current = useJournalFilterStore.getState().selectedDay;
  const next =
    day !== null &&
    current !== null &&
    formatJournalDate(day) === formatJournalDate(current)
      ? null
      : day;

  if (next === current) return;
  useJournalFilterStore.setState(next === null ? EMPTY : { selectedDay: next });
}

/** Test seam: no UI clears the whole filter set yet, but tests must. */
export function resetJournalFilter(): void {
  useJournalFilterStore.setState(EMPTY);
}

export function useJournalFilter(): JournalFilterState {
  return useJournalFilterStore();
}
