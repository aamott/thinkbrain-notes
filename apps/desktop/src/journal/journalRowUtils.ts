import { type JournalRow } from "./journalViewModel";

/** A header's accessible name carries its count; the visible badge is not enough. */
export function rowName(row: JournalRow): string {
  if (row.kind === "entry") {
    const base = row.timeLabel ? `${row.dateLabel}, ${row.timeLabel}` : `${row.dateLabel}`;
    const preview = row.preview?.trim();
    return preview ? `${base}, ${preview}` : base;
  }
  if (row.kind === "undated-entry") {
    const preview = row.preview?.trim();
    return preview ? `${row.label}, ${preview}` : row.label;
  }
  const count = row.count ?? 0;
  return `${row.label}, ${count} ${count === 1 ? "entry" : "entries"}`;
}
