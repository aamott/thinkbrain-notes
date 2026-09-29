import { useCallback, useEffect, useRef, useState } from "react";

import { Unavailable } from "../shell/Unavailable";
import { CodeMirrorDiff } from "./CodeMirrorDiff";
import { describeSize, describeWhen, noteName } from "./conflictCard";
import { readConflict, resolveConflict } from "./conflictService";
import type { ConflictComparison, ConflictResolution } from "./conflictTypes";
import { failureMessage } from "./syncCopy";

/**
 * Two versions of one note, side by side — and a result that can be edited.
 *
 * The left pane is the incoming version and is read-only. The right pane
 * starts as this computer's version and is what "Save merged note" writes,
 * whether it was changed by the arrows between the panes or edited directly.
 * CodeMirror aligns and renders the two; the native side still owns the
 * safety contract — fingerprints, checkpoints and the write itself — through
 * `resolveConflict`, exactly as the whole-file actions use it.
 */

interface MergeTabProps {
  readonly rootPath: string | null;
  /** The conflict copy this tab is about. */
  readonly copyPath: string | null;
  /**
   * Unsaved text from an editor open on this note, if there is one.
   *
   * "This computer's version" has to be what the user is looking at. Comparing
   * against the last save would offer them a version of their own note that
   * they can see is out of date.
   */
  readonly buffer?: string | null;
}
type Phase =
  | { readonly at: "loading" }
  | { readonly at: "ready"; readonly conflict: ConflictComparison }
  | { readonly at: "done"; readonly note: string; readonly keptAs: string | null }
  | { readonly at: "failed"; readonly message: string };

const COMPARE_FAILURE = "Something went wrong reading the two versions.";

/**
 * Starts a fresh session per conflict.
 *
 * The key is what resets the result when the tab is pointed at a different
 * conflict, rather than an effect that clears it — and it is why the session
 * below never has to put itself back into a loading state.
 */
export function MergeTab({ rootPath, copyPath, buffer }: MergeTabProps) {
  if (!rootPath || !copyPath) {
    return <Unavailable title="Nothing to compare" description="This tab has lost track of which note it was about." />;
  }
  return (
    <MergeSession key={`${rootPath}:${copyPath}`} rootPath={rootPath} copyPath={copyPath} buffer={buffer} />
  );
}

interface MergeSessionProps {
  readonly rootPath: string;
  readonly copyPath: string;
  readonly buffer?: string | null;
}

function MergeSession({ rootPath, copyPath, buffer }: MergeSessionProps) {
  const [phase, setPhase] = useState<Phase>({ at: "loading" });
  const [resolving, setResolving] = useState(false);

  // Taken once, when the comparison is opened. The editor's text changes with
  // every keystroke, and re-reading on each one would throw away the result
  // already edited — "this computer's version" means the one on screen when
  // the user came to compare, not a moving target.
  const openedWith = useRef(buffer);

  useEffect(() => {
    let cancelled = false;
    void readConflict(rootPath, copyPath, openedWith.current)
      .then((conflict) => {
        if (!cancelled) setPhase({ at: "ready", conflict });
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setPhase({ at: "failed", message: failureMessage(cause, COMPARE_FAILURE) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [copyPath, rootPath]);

  const resolve = useCallback(
    async (resolution: ConflictResolution) => {
      if (phase.at !== "ready") return;
      setResolving(true);
      try {
        const done = await resolveConflict(rootPath, phase.conflict, resolution);
        setPhase({ at: "done", note: done.note, keptAs: done.keptAs });
      } catch (cause) {
        setPhase({ at: "failed", message: failureMessage(cause, COMPARE_FAILURE) });
      } finally {
        setResolving(false);
      }
    },
    [phase, rootPath]
  );

  if (phase.at === "loading") {
    return <Unavailable title="Opening both versions" description="Reading what each device has." />;
  }
  if (phase.at === "failed") {
    return <Unavailable title="Could not compare these versions" description={phase.message} />;
  }
  if (phase.at === "done") {
    return (
      <Unavailable
        title="Saved"
        description={
          phase.keptAs
            ? `Both versions were kept — the other one is now "${phase.keptAs}". You can always undo: earlier versions are kept in Version history.`
            : "You can always undo — the earlier versions of this note are kept in Version history."
        }
      />
    );
  }

  return (
    <MergeSurface conflict={phase.conflict} resolving={resolving} onResolve={resolve} />
  );
}

interface MergeSurfaceProps {
  readonly conflict: ConflictComparison;
  readonly resolving: boolean;
  readonly onResolve: (resolution: ConflictResolution) => void;
}

const ACTION_BUTTON =
  "rounded-small border border-border bg-surface px-3 py-1.5 text-xs text-foreground disabled:opacity-50";
const SAVE_BUTTON =
  "rounded-small border border-primary bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50";

function MergeSurface({ conflict, resolving, onResolve }: MergeSurfaceProps) {
  const { ours, theirs } = conflict;
  const comparable = conflict.kind === "text";
  const note = noteName(ours.path);

  // Whatever the right pane currently holds — moved by the transfer arrows,
  // typed, or untouched. Sent verbatim as the merged note on save. It seeds
  // from this computer's complete version, exactly as the comparison sent it.
  const [result, setResult] = useState(comparable ? conflict.text.current : "");

  return (
    <section
      className="@container flex min-h-0 min-w-0 max-w-full flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden p-4"
      aria-label={`Compare versions of ${note}`}
    >
      <header className="rounded-small border border-border bg-card p-4">
        <h2 className="m-0 text-base font-semibold text-card-foreground">
          Two versions of this note exist
        </h2>
        <p className="mb-0 mt-1.5 text-xs leading-relaxed text-muted-foreground">
          &ldquo;{note}&rdquo; was edited on another device before this one finished syncing.
          {comparable
            ? ` The ${theirs.label} version is on the left and cannot be changed; the ${ours.label} version on the right is what will be saved. Use the arrows between the panes to bring parts across, edit the result however you need, then save it.`
            : " This file can't be compared line by line, so choose which version to keep below."}
        </p>
      </header>

      {/* In pane order: the incoming version on the left, this computer's —
          the editable result — on the right. */}
      <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2">
        {[theirs, ours].map((version) => (
          <div key={version.path} className="rounded-small border border-border bg-surface px-3 py-2">
            <p className="m-0 text-xs font-semibold text-foreground">{version.label}</p>
            <p className="m-0 text-[0.7rem] text-muted-foreground">
              {describeWhen(version.changedAt)} · {describeSize(version.byteSize)}
            </p>
          </div>
        ))}
      </div>

      {comparable ? (
        // A floor keeps the diff usable on a very short screen — the
        // section scrolls instead of the comparison collapsing away.
        <div className="flex min-h-56 min-w-0 max-w-full flex-1 flex-col overflow-hidden">
          <CodeMirrorDiff
            before={conflict.text.incoming}
            after={conflict.text.current}
            beforeLabel={theirs.label}
            afterLabel={`${ours.label} — what will be saved`}
            relativePath={ours.path}
            editableAfter
            transferBeforeToAfter
            onAfterChange={setResult}
            ariaLabel={`Side-by-side comparison of the two versions of ${note}`}
          />
        </div>
      ) : (
        <p className="m-0 rounded-small border border-border bg-card p-3 text-xs leading-relaxed text-muted-foreground">
          This file can&apos;t be compared piece by piece — its contents aren&apos;t text. Choose a
          whole version below; the one you don&apos;t pick can still be kept as a separate file.
        </p>
      )}

      <footer className="flex flex-col gap-2 @2xl:flex-row @2xl:items-center @2xl:justify-between">
        <p className="m-0 text-[0.7rem] text-muted-foreground">
          You can always undo — previous versions are kept in Version history.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={ACTION_BUTTON}
            disabled={resolving}
            onClick={() => onResolve({ kind: "keepOurs" })}
          >
            Keep current
          </button>
          <button
            type="button"
            className={ACTION_BUTTON}
            disabled={resolving}
            onClick={() => onResolve({ kind: "keepTheirs" })}
          >
            Use incoming
          </button>
          <button
            type="button"
            className={ACTION_BUTTON}
            disabled={resolving}
            onClick={() => onResolve({ kind: "keepBoth" })}
          >
            Keep both files
          </button>
          {comparable && (
            <button
              type="button"
              className={SAVE_BUTTON}
              disabled={resolving}
              onClick={() => onResolve({ kind: "merged", contents: result })}
            >
              Save merged note
            </button>
          )}
        </div>
      </footer>
    </section>
  );
}
