import { useCallback, useEffect, useState } from "react";

import { NativeCommandError } from "../native/commands";
import { Unavailable } from "../shell/Unavailable";
import { noteName } from "./conflictCard";
import type { ChangedNote, ConflictRate, RecordedChange } from "./historyTypes";
import { describeConflictRate, describeMoment, describeWhatChanged } from "./syncCopy";
import {
  readConflictRate,
  readHistory,
  restoreVersion,
  subscribeToSyncStatus
} from "./syncService";
import { useSyncStatus } from "./useSyncStatus";

/**
 * Everything this workspace has saved, and the way back to any of it.
 *
 * Two surfaces in one, because they are two questions about one list. Opened
 * from the footer it is the whole history; opened from a note it is that note's
 * earlier versions — which is the same walk, asked a narrower question, so the
 * two can never disagree about what happened.
 *
 * Nothing here is destructive. Putting a version back saves what it replaced
 * first, so the way out of a restore is another restore.
 */

interface HistoryPanelProps {
  readonly rootPath: string | null;
  /** When set, only this note's earlier versions are listed. */
  readonly note: string | null;
  /** Leaves a single note's versions for the whole workspace's history. */
  readonly onShowEverything: () => void;
}

/** One read of the panel: what it holds, or why it could not be read. */
interface Read {
  readonly changes: readonly RecordedChange[] | null;
  readonly rate: ConflictRate | null;
  readonly error: string | null;
}

export function HistoryPanel({ rootPath, note, onShowEverything }: HistoryPanelProps) {
  const [changes, setChanges] = useState<readonly RecordedChange[]>([]);
  const [rate, setRate] = useState<ConflictRate | null>(null);
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { alongsideOwnGit } = useSyncStatus(rootPath);

  /** Reads the list, changing nothing. {@link apply} is the only writer. */
  const read = useCallback(async (): Promise<Read | null> => {
    if (!rootPath) return null;
    try {
      const [changes, rate] = await Promise.all([
        readHistory(rootPath, note),
        readConflictRate(rootPath)
      ]);
      return { changes, rate, error: null };
    } catch (cause) {
      return { changes: null, rate: null, error: messageOf(cause, "This folder's saved versions could not be read.") };
    }
  }, [note, rootPath]);

  const apply = useCallback((result: Read | null) => {
    if (!result) return;
    if (result.changes) setChanges(result.changes);
    if (result.rate) setRate(result.rate);
    setError(result.error);
  }, []);

  // One effect for the first read and every one after it. The sweeper announces
  // when it has written something, which is exactly when this list is out of
  // date — including after a restore made in this very window.
  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | null = null;
    const reload = () => {
      void read().then((result) => {
        if (!cancelled) apply(result);
      });
    };

    reload();
    void subscribeToSyncStatus(reload).then((unlisten) => {
      if (cancelled) unlisten();
      else stop = unlisten;
    });

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [apply, read]);

  const putBack = useCallback(
    async (change: RecordedChange, path: string) => {
      if (!rootPath) return;
      setBusy(`${change.id}:${path}`);
      setNotice(null);
      let failure: string | null = null;
      try {
        await restoreVersion(rootPath, path, change.id);
      } catch (cause) {
        failure = messageOf(cause, "That version could not be put back. Nothing was changed.");
      }
      // Always after the attempt, and the report last: the re-read clears the
      // previous message, and a failure the list overwrote would be a failure
      // nobody was told about.
      apply(await read());
      if (failure) setError(failure);
      else setNotice(`"${noteName(path)}" is back to how it was ${describeMoment(change.at).toLowerCase()}.`);
      setBusy(null);
    },
    [apply, read, rootPath]
  );

  const toggle = useCallback((id: string) => {
    setOpened((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  if (!rootPath) {
    return <Unavailable title="No workspace open" description="Open a workspace to see what it has saved." />;
  }

  return (
    <section className="@container flex min-h-0 flex-1 flex-col overflow-y-auto" aria-label="Saved versions">
      <header className="border-b border-border px-3 py-3">
        <h3 className="m-0 text-sm font-semibold text-foreground">
          {note ? `Earlier versions of ${noteName(note)}` : "History"}
        </h3>
        <p className="mb-0 mt-1 text-xs leading-relaxed text-muted-foreground">
          {note
            ? "Every version of this note that was saved. Putting one back saves what it replaces, so you can change your mind again."
            : "Everything saved in this folder, newest first. Open one to see which notes changed and to put any of them back."}
        </p>
        {alongsideOwnGit && (
          <p className="mb-0 mt-2 text-[0.7rem] leading-relaxed text-muted-foreground">
            This folder also keeps its own version history. That one is left exactly as it is —
            what you see here is a second, separate record kept outside your notes.
          </p>
        )}
        {note && (
          <button type="button" className={QUIET_BUTTON + " mt-2"} onClick={onShowEverything}>
            Show everything instead
          </button>
        )}
      </header>

      {error !== null && (
        <p role="alert" className="m-3 rounded-small border border-danger px-2 py-1.5 text-xs text-danger">
          {error}
        </p>
      )}
      {notice !== null && (
        <p role="status" className="m-3 rounded-small border border-border px-2 py-1.5 text-xs text-muted-foreground">
          {notice}
        </p>
      )}

      {changes.length === 0 && error === null ? (
        <Unavailable
          title={note ? "No earlier versions yet" : "Nothing saved yet"}
          description={
            note
              ? "This note has only ever been saved once. Later versions will show up here as you edit it."
              : "As you edit your notes, every few seconds of work is saved here so you can go back to it."
          }
        />
      ) : (
        <ol className="m-0 flex list-none flex-col gap-2 p-3">
          {changes.map((change) => (
            <Entry
              key={change.id}
              change={change}
              open={opened.has(change.id) || note !== null}
              collapsible={note === null}
              busy={busy}
              onToggle={() => toggle(change.id)}
              onRestore={(path) => void putBack(change, path)}
            />
          ))}
        </ol>
      )}

      {rate !== null && rate.recorded > 0 && (
        <p className="m-0 border-t border-border px-3 py-2 text-[0.7rem] text-muted-foreground">
          {describeConflictRate(rate)}
        </p>
      )}
    </section>
  );
}

const QUIET_BUTTON =
  "rounded-small border border-border bg-surface px-2 py-1 text-xs text-foreground disabled:opacity-50";

interface EntryProps {
  readonly change: RecordedChange;
  readonly open: boolean;
  /** A single note's versions are always open — there is nothing to fold away. */
  readonly collapsible: boolean;
  readonly busy: string | null;
  readonly onToggle: () => void;
  readonly onRestore: (path: string) => void;
}

function Entry({ change, open, collapsible, busy, onToggle, onRestore }: EntryProps) {
  const summary = `${describeMoment(change.at)} — ${describeWhatChanged(change.notes)}`;

  return (
    <li className="rounded-small border border-border bg-card p-3">
      {collapsible ? (
        <button
          type="button"
          aria-expanded={open}
          className="m-0 w-full cursor-pointer border-0 bg-transparent p-0 text-left text-xs font-semibold text-card-foreground"
          onClick={onToggle}
        >
          {summary}
        </button>
      ) : (
        <p className="m-0 text-xs font-semibold text-card-foreground">{summary}</p>
      )}

      {open && (
        <>
          <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
            {change.notes.map((note) => (
              <NoteRow
                key={note.path}
                note={note}
                busy={busy === `${change.id}:${note.path}`}
                onRestore={() => onRestore(note.path)}
              />
            ))}
          </ul>
          {/* The escape hatch: exactly what was written down, for anyone who
              would rather read the record than our rendering of it. */}
          <details className="mt-2 text-[0.68rem] text-muted-foreground">
            <summary className="cursor-pointer">What was written down</summary>
            <p className="m-0 mt-1 break-words font-mono">{change.message}</p>
          </details>
        </>
      )}
    </li>
  );
}

function NoteRow({
  note,
  busy,
  onRestore
}: {
  readonly note: ChangedNote;
  readonly busy: boolean;
  readonly onRestore: () => void;
}) {
  return (
    <li className="flex flex-col gap-1 @xs:flex-row @xs:items-center @xs:justify-between">
      <span className="break-words text-[0.7rem] text-muted-foreground">
        {noteName(note.path)}
        {note.change === "removed" && " — deleted"}
      </span>
      {/* A deletion left no text behind, so there is nothing here to put back;
          the version before it is the one to restore, and it is further down. */}
      {note.change !== "removed" && (
        <button type="button" className={QUIET_BUTTON} onClick={onRestore} disabled={busy}>
          Put this version back
        </button>
      )}
    </li>
  );
}

function messageOf(cause: unknown, fallback: string): string {
  return cause instanceof NativeCommandError ? cause.message : fallback;
}
