import { AlertTriangle } from "lucide-react";

/**
 * Tells the user a note changed on disk while they were editing it.
 *
 * Shown only when the tab has unsaved edits — a clean tab just re-reads the
 * file, silently, because nothing is at stake. Here two versions exist and only
 * the user knows which one matters.
 *
 * Raised from two places: the watcher noticing the change while the tab sat
 * there, and a save the native side refused because the file was no longer what
 * the tab claimed. The second is the backstop — it catches the change whether
 * or not the watcher saw it.
 *
 * Deliberately not a modal, unlike {@link DirtyCloseDialog}. The user did not
 * ask for this and may be mid-sentence, so it neither takes focus nor traps it;
 * `role="status"` with a polite live region lets a screen reader announce it
 * without interrupting. It stays until answered, and one sits above each
 * affected tab, so a `git pull` across several open notes produces no pile-up.
 */
export function StaleDocumentBanner({
  fileName,
  onKeepMine,
  onLoadFromDisk
}: {
  readonly fileName: string;
  /**
   * Keeps the unsaved edits and stops asking. Deliberately does not write:
   * replacing the newer file takes the same deliberate save it always took,
   * rather than falling out of dismissing a message.
   */
  readonly onKeepMine: () => void;
  /** Replaces the tab's text with what is on disk, discarding the edits. */
  readonly onLoadFromDisk: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center gap-3 py-[0.6rem] px-[0.9rem] border-b border-warning/40 bg-warning/10"
    >
      <AlertTriangle className="shrink-0 size-[1.05rem] text-warning" aria-hidden="true" />
      <p className="flex-1 min-w-[16rem] m-0 text-xs text-foreground">
        <b className="font-semibold">
          {fileName} changed on disk while you were editing it.
        </b>{" "}
        <span className="block text-muted-foreground text-[0.7rem]">
          You have unsaved edits, so nothing has been replaced.
        </span>
      </p>
      <span className="flex shrink-0 gap-[0.4rem]">
        <button
          type="button"
          className="border border-border rounded-small py-[0.28rem] px-[0.6rem] text-foreground bg-surface cursor-pointer font-inherit text-[0.72rem]"
          onClick={onKeepMine}
        >
          Keep mine
        </button>
        <button
          type="button"
          className="border border-primary rounded-small py-[0.28rem] px-[0.6rem] text-primary-foreground bg-primary cursor-pointer font-inherit text-[0.72rem]"
          onClick={onLoadFromDisk}
        >
          Load the disk version
        </button>
      </span>
    </div>
  );
}
