import { useSyncExternalStore } from "react";
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

let state: JournalFilterState = EMPTY;
const listeners = new Set<() => void>();

export function getJournalFilter(): JournalFilterState {
  return state;
}

/** Selecting the day already selected clears it, so a click toggles (D60). */
export function selectJournalDay(day: JournalDate | null): void {
  const next =
    day !== null &&
    state.selectedDay !== null &&
    formatJournalDate(day) === formatJournalDate(state.selectedDay)
      ? null
      : day;

  if (next === state.selectedDay) return;
  state = next === null ? EMPTY : Object.freeze({ selectedDay: next });
  for (const listener of listeners) listener();
}

export function subscribeJournalFilter(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test seam: no UI clears the whole filter set yet, but tests must. */
export function resetJournalFilter(): void {
  state = EMPTY;
  for (const listener of listeners) listener();
}

export function useJournalFilter(): JournalFilterState {
  return useSyncExternalStore(subscribeJournalFilter, getJournalFilter, getJournalFilter);
}
