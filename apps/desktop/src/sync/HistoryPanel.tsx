import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { noteName } from "../lib/utils";
import { Unavailable } from "../shell/Unavailable";
import type { RecordedChange, VersionDiff } from "./historyTypes";
import { lineDelta } from "./mergeModel";
import { describeMoment, failureMessage, restoreFailureMessage } from "./syncCopy";
import { readHistory, readVersionDiff } from "./syncService";
import { useSyncStatus } from "./useSyncStatus";

/**
 * The recorded versions of the file being looked at, newest first.
 *
 * A document inspector rather than a workspace ledger: there is one question
 * here — "what did this file look like before?" — and two ways to answer it.
 * Compare opens a read-only side-by-side in a tab; Restore asks the shell to
 * put a version back, which saves any unsaved edits first so nothing written
 * is lost under it.
 */

interface HistoryPanelProps {
  readonly rootPath: string | null;
  /** The file whose earlier versions are listed, or `null` when none is open. */
  readonly note: string | null;
  /**
   * Ready contents of the open document, or `null` when there is no text to
   * compare against — a file still loading, or one that isn't text at all.
   */
  readonly currentContents: string | null;
  /** Opens a read-only comparison of the file with one recorded version. */
  readonly onCompare: (notePath: string, changeId: string) => void;
  /**
   * Puts a recorded version back. Shell-owned: an open dirty file is saved
   * first, and a save that cannot happen aborts the restore loudly.
   */
  readonly onRestore: (notePath: string, changeId: string) => Promise<void>;
}

/** One read of the panel: what it holds, or why it could not be read. */
interface Read {
  readonly changes: readonly RecordedChange[] | null;
  readonly error: string | null;
}

export function HistoryPanel({
  rootPath,
  note,
  currentContents,
  onCompare,
  onRestore
}: HistoryPanelProps) {
  if (!rootPath) {
    return (
      <Unavailable
        title="No workspace open"
        description="Open a workspace to see a file's earlier versions."
      />
    );
  }
  if (!note) {
    return (
      <Unavailable
        title="No file open"
        description="Open a file to see the versions recorded of it."
      />
    );
  }
  // A different file is a different session: the key remounts rather than an
  // effect resetting state, so a restore or read still in flight for the
  // previous file resolves onto an unmounted component and can leak neither
  // its list nor its notice into this file's timeline.
  return (
    <HistorySession
      key={`${rootPath}\0${note}`}
      rootPath={rootPath}
      note={note}
      currentContents={currentContents}
      onCompare={onCompare}
      onRestore={onRestore}
    />
  );
}

function HistorySession({
  rootPath,
  note,
  currentContents,
  onCompare,
  onRestore
}: {
  readonly rootPath: string;
  readonly note: string;
  readonly currentContents: string | null;
  readonly onCompare: (notePath: string, changeId: string) => void;
  readonly onRestore: (notePath: string, changeId: string) => Promise<void>;
}) {
  const [changes, setChanges] = useState<readonly RecordedChange[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Per-revision comparison results, fetched lazily as cards scroll into
  // view. A recorded version never changes, so the fetched "theirs" side
  // stays right as the current file is edited — the badge recomputes its
  // +/− against the live contents rather than refetching per keystroke. The
  // session's keyed remount is what keeps another file's reads out of it.
  const diffCache = useMemo<DiffCache>(() => new Map(), []);

  /** Reads the list, changing nothing. {@link apply} is the only writer. */
  const read = useCallback(async (): Promise<Read> => {
    try {
      return { changes: await readHistory(rootPath, note), error: null };
    } catch (cause) {
      return {
        changes: null,
        error: failureMessage(cause, "This file's earlier versions could not be read.", true)
      };
    }
  }, [note, rootPath]);

  const apply = useCallback((result: Read) => {
    if (result.changes) setChanges(result.changes);
    setError(result.error);
    setLoaded(true);
  }, []);

  const reload = useCallback(() => {
    void read().then(apply);
  }, [apply, read]);

  // Live status keeps the list fresh when a record lands (or a restore writes
  // one); the alongside-git sentence is owed to anyone whose folder already
  // keeps its own history.
  const status = useSyncStatus(rootPath, undefined, reload);

  const putBack = useCallback(
    async (change: RecordedChange) => {
      if (busyId !== null) return;
      setBusyId(change.id);
      setNotice(null);
      let failure: string | null = null;
      try {
        await onRestore(note, change.id);
      } catch (cause) {
        failure = restoreFailureMessage(cause);
      }
      // Always re-read, and the report last: a restore writes a new recorded
      // change, and a failure the list overwrote would be a failure nobody saw.
      apply(await read());
      if (failure) setError(failure);
      else setNotice(`"${noteName(note)}" is back to how it was ${describeMoment(change.at).toLowerCase()}.`);
      setBusyId(null);
    },
    [apply, busyId, note, onRestore, read]
  );

  return (
    <section
      className="@container flex min-h-0 flex-1 flex-col overflow-y-auto"
      aria-label="Version history"
    >
      <header className="border-b border-border px-3 py-3">
        {/* The surrounding popout already names the panel — the heading names
            the file, so the two never read the same words twice. */}
        <h3 className="m-0 text-sm font-semibold text-foreground">{noteName(note)}</h3>
        <p className="mb-0 mt-1 text-xs leading-relaxed text-muted-foreground">
          Every recorded version of {noteName(note)}, newest first. Putting one back saves what it
          replaces first, so you can always change your mind again.
        </p>
        {status.alongsideOwnGit && (
          <p className="mb-0 mt-2 text-[0.7rem] leading-relaxed text-muted-foreground">
            This folder also keeps its own version history. That one is left exactly as it is —
            what you see here is a second, separate record kept outside your notes.
          </p>
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

      {!loaded ? null : changes.length === 0 && error === null ? (
        <Unavailable
          title="No earlier versions yet"
          description="This file has only ever been saved once. Later versions will show up here as it changes."
        />
      ) : (
        <>
          <p className="m-0 px-3 pt-3 text-[0.7rem] text-muted-foreground">
            {changes.length} {changes.length === 1 ? "revision" : "revisions"} recorded
          </p>
          <ol className="m-0 flex list-none flex-col gap-2 p-3">
            {changes.map((change) => (
              <RevisionCard
                key={change.id}
                rootPath={rootPath}
                note={note}
                change={change}
                currentContents={currentContents}
                cache={diffCache}
                busy={busyId !== null}
                onCompare={() => onCompare(note, change.id)}
                onRestore={() => void putBack(change)}
              />
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

const ACTION_BUTTON =
  "rounded-small border border-border bg-surface px-2 py-1 text-xs text-foreground disabled:opacity-50";
const COMPARE_BUTTON =
  "rounded-small border border-primary bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50";

type DiffCache = Map<string, VersionDiff | null>;

interface RevisionCardProps {
  readonly rootPath: string;
  readonly note: string;
  readonly change: RecordedChange;
  readonly currentContents: string | null;
  readonly cache: DiffCache;
  readonly busy: boolean;
  readonly onCompare: () => void;
  readonly onRestore: () => void;
}

function RevisionCard({
  rootPath,
  note,
  change,
  currentContents,
  cache,
  busy,
  onCompare,
  onRestore
}: RevisionCardProps) {
  // A change that deleted this file left no version of it behind — there is
  // nothing to compare or put back, and the version before it is further down.
  const restorable = change.notes.find((entry) => entry.path === note)?.change !== "removed";

  return (
    <li className="rounded-small border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="m-0 text-xs font-semibold text-card-foreground">
          {describeMoment(change.at)}
        </p>
        {restorable && (
          <RevisionBadge
            rootPath={rootPath}
            note={note}
            changeId={change.id}
            currentContents={currentContents}
            cache={cache}
          />
        )}
      </div>
      <p className="mb-0 mt-1 text-[0.7rem] leading-relaxed text-muted-foreground">
        {change.message}
      </p>
      {restorable && (
        <div className="mt-2 flex gap-1.5">
          <button
            type="button"
            className={COMPARE_BUTTON + " flex-1"}
            disabled={busy}
            onClick={onCompare}
          >
            Compare Diff
          </button>
          <button type="button" className={ACTION_BUTTON} disabled={busy} onClick={onRestore}>
            Restore
          </button>
        </div>
      )}
    </li>
  );
}

interface RevisionBadgeProps {
  readonly rootPath: string;
  readonly note: string;
  readonly changeId: string;
  readonly currentContents: string | null;
  readonly cache: DiffCache;
}

const BADGE = "rounded px-1 text-[0.6rem] leading-4";
const BADGE_LOADED = "bg-surface text-muted-foreground";
const BADGE_PENDING = "bg-surface/50 text-muted-foreground/60";

/**
 * How many lines restoring a revision would add and remove — the same
 * comparison `CodeMirrorDiff` draws for "Preview restore", counted rather
 * than drawn, so the badge and the preview can never disagree.
 *
 * The diff is fetched lazily, once, when the card scrolls into view (plain
 * environments fetch straight away): what changes afterwards is only the
 * count, recomputed locally from the live contents.
 */
function RevisionBadge({ rootPath, note, changeId, currentContents, cache }: RevisionBadgeProps) {
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const [visible, setVisible] = useState(false);
  const cacheKey = `${note}\0${changeId}`;
  const [diff, setDiff] = useState<VersionDiff | null | undefined>(() => cache.get(cacheKey));

  useEffect(() => {
    if (visible) return;
    const host = hostRef.current;
    // IntersectionObserver may be absent (tests); fetch eagerly then, the
    // badge is small and the timeline is short.
    if (!host || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [visible]);

  // The buffer handed to the native diff is read once at fetch time: it only
  // decides what `text.current` comes back as, and the badge compares against
  // the live contents below rather than that snapshot.
  const contentsAtFetch = useRef(currentContents);

  useEffect(() => {
    // A cached entry was already picked up by the state initializer — no
    // fetch and no write-back is owed. Only `undefined` means "not asked yet".
    if (!visible || cache.get(cacheKey) !== undefined) return;
    let cancelled = false;
    readVersionDiff(rootPath, note, changeId, contentsAtFetch.current)
      .then((result) => {
        cache.set(cacheKey, result);
        if (!cancelled) setDiff(result);
      })
      .catch(() => {
        cache.set(cacheKey, null);
        if (!cancelled) setDiff(null);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, rootPath, note, changeId, cacheKey, cache]);

  // Restore direction: "added" is what putting the recorded version back
  // would add, "removed" what it would take out — the recorded version is the
  // destination, so it is the delta's `after`.
  const delta = useMemo(() => {
    if (!diff || diff.kind !== "text") return null;
    const current = currentContents ?? diff.text.current;
    return lineDelta(current, diff.text.recorded);
  }, [diff, currentContents]);

  return (
    <span ref={hostRef} className="shrink-0" aria-hidden={diff === undefined}>
      {diff === undefined ? (
        <span className={BADGE + " " + BADGE_PENDING}>…</span>
      ) : diff === null ? null : delta === null ? (
        <span className={BADGE + " " + BADGE_LOADED}>not text</span>
      ) : (
        <span className={BADGE + " " + BADGE_LOADED}>+{delta.added} -{delta.removed}</span>
      )}
    </span>
  );
}
