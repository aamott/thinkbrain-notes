import { type JournalRow } from "./journalViewModel";

/** A header's accessible name carries its count; the visible badge is not enough. */
export function rowName(row: JournalRow): string {
  if (row.kind === "entry") {
    return row.timeLabel ? `${row.dateLabel}, ${row.timeLabel}` : `${row.dateLabel}`;
  }
  if (row.kind === "undated-entry") return row.label;
  const count = row.count ?? 0;
  return `${row.label}, ${count} ${count === 1 ? "entry" : "entries"}`;
}
