/**
 * What a tab shows when the note behind it cannot be read as text.
 *
 * The generic `Unavailable` placeholder this replaces was a dead end: it named
 * the failure and stopped there, which for the one failure a notes app cannot
 * afford is not enough. Here the kept versions are on the same screen as the
 * bad news, because someone who has just been told their note is damaged should
 * not also have to find out where the app keeps copies.
 *
 * Only reached for `workspace.note_unreadable` — a note that is genuinely
 * absent, or unreadable for a reason the app cannot name, still gets the plain
 * placeholder. Offering recovery for a file that was simply deleted elsewhere
 * would be claiming more than is known.
 */

import { AlertTriangle } from "lucide-react";

import { NoteVersionList } from "./NoteVersionList";

/** Props for {@link DamagedNote}. */
export interface DamagedNoteProps {
  readonly rootPath: string;
  readonly relativePath: string;
  /** What the native side said, shown verbatim rather than paraphrased. */
  readonly detail: string | null;
  /** Re-reads the note, once a version has been put back. */
  readonly onRestored: () => void;
}

export function DamagedNote({ rootPath, relativePath, detail, onRestored }: DamagedNoteProps) {
  return (
    <section
      role="status"
      aria-live="polite"
      className="flex flex-col gap-3 m-auto p-6 max-w-prose"
    >
      <h2 className="flex items-center gap-2 m-0 text-sm font-medium text-foreground">
        <AlertTriangle className="shrink-0 size-[1.05rem] text-warning" aria-hidden="true" />
        This note could not be opened
      </h2>
      <p className="m-0 text-xs text-foreground">
        {detail ?? "The file is not readable as text."} The file has not been changed, and nothing
        has been written over it.
      </p>
      <NoteVersionList
        rootPath={rootPath}
        relativePath={relativePath}
        onRestored={onRestored}
      />
    </section>
  );
}
