/**
 * What a triage card should offer for one conflict, and how to say it.
 *
 * The native side answers "can these two be compared line by line". That is
 * necessary but not sufficient: a whiteboard is JSON and a vector logo is
 * markup, so both *can* be compared and neither *should* be. The rest of the
 * decision is about what the file is for, which is a question about its name.
 */

import type { ConflictSummary } from "./conflictTypes";

/** How a card presents itself. */
export type CardTreatment =
  /** Two versions, side by side, chunk by chunk. */
  | "review"
  /** Two pictures and their sizes and dates. */
  | "image"
  /** An honest explanation instead of a comparison that would not help. */
  | "whiteboard"
  /** Names, sizes and dates, and a whole-file choice. */
  | "file";

const PICTURE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "avif",
  "svg"
]);

/** The file name out of a workspace-relative path. */
export function noteName(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

function extensionOf(path: string): string {
  const name = noteName(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/**
 * Which card to draw.
 *
 * Name before content, deliberately. A `.canvas` board and an `.svg` drawing
 * are both text, and a line-by-line comparison of either is a wall of syntax
 * where the user expected to see their work.
 */
export function treatmentOf(summary: ConflictSummary): CardTreatment {
  const extension = extensionOf(summary.ours.path);
  if (extension === "canvas") return "whiteboard";
  if (PICTURE_EXTENSIONS.has(extension)) return "image";
  return summary.kind === "text" ? "review" : "file";
}

const KB = 1024;

/** A file size a person can read at a glance. */
export function describeSize(bytes: number): string {
  if (bytes < 1000) return bytes === 1 ? "1 byte" : `${bytes} bytes`;
  if (bytes < 1000 * KB) return `${Math.round(bytes / KB)} KB`;
  return `${(bytes / (KB * KB)).toFixed(1)} MB`;
}

/**
 * When a version was last written, in the reader's own locale.
 *
 * Not relative ("2 hours ago"): the whole point of the two columns is to let
 * someone work out which version is theirs, and that is a comparison of two
 * clock times against a memory of when they were at which computer.
 */
export function describeWhen(milliseconds: number | null): string {
  if (milliseconds === null) return "Unknown";
  return new Date(milliseconds).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}
