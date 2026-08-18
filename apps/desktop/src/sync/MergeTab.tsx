import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { NativeCommandError } from "../native/commands";
import { Unavailable } from "../shell/Unavailable";
import { describeSize, describeWhen, noteName } from "./conflictCard";
import { readConflict, resolveConflict } from "./conflictService";
import type { ConflictChunk, ConflictComparison } from "./conflictTypes";
import {
  countLines,
  isSettled,
  mergedText,
  resultSegments,
  undecidedCount,
  type ChunkPick,
  type ChunkPicks
} from "./mergeModel";

/**
 * Two versions of one note, and a decision for each place they differ.
 *
 * The screen is built around one promise: what the Result pane shows is what
 * gets saved. Both come from the same function of the same state, so they
 * cannot drift — see `mergeModel.ts`.
 *
 * There is no conflict marker anywhere in here, and no way for one to appear:
 * the native side hands over chunks, and a chunk is a pair of strings.
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

/**
 * Starts a fresh session per conflict.
 *
 * The key is what resets the decisions when the tab is pointed at a different
 * conflict, rather than an effect that clears them — and it is why the session
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
  const [picks, setPicks] = useState<ChunkPicks>(() => new Map());
  const [saving, setSaving] = useState(false);

  // Taken once, when the comparison is opened. The editor's text changes with
  // every keystroke, and re-reading on each one would throw away the decisions
  // already made — "this computer's version" means the one on screen when the
  // user came to compare, not a moving target.
  const openedWith = useRef(buffer);

  useEffect(() => {
    let cancelled = false;
    void readConflict(rootPath, copyPath, openedWith.current)
      .then((conflict) => {
        if (!cancelled) setPhase({ at: "ready", conflict });
      })
      .catch((cause: unknown) => {
        if (!cancelled) setPhase({ at: "failed", message: messageOf(cause) });
      });
    return () => {
      cancelled = true;
    };
  }, [copyPath, rootPath]);

  const choose = useCallback((index: number, pick: ChunkPick) => {
    setPicks((current) => new Map(current).set(index, pick));
  }, []);

  const save = useCallback(
    async (contents: string) => {
      if (phase.at !== "ready") return;
      setSaving(true);
      try {
        const done = await resolveConflict(rootPath, phase.conflict, { kind: "merged", contents });
        setPhase({ at: "done", note: done.note, keptAs: done.keptAs });
      } catch (cause) {
        setPhase({ at: "failed", message: messageOf(cause) });
      } finally {
        setSaving(false);
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
            ? `Both versions were kept — the other one is now "${phase.keptAs}". You can always undo: earlier versions are kept in History.`
            : "You can always undo — the earlier versions of this note are kept in History."
        }
      />
    );
  }

  return (
    <MergeSurface
      conflict={phase.conflict}
      picks={picks}
      saving={saving}
      onChoose={choose}
      onSave={save}
    />
  );
}

interface MergeSurfaceProps {
  readonly conflict: ConflictComparison;
  readonly picks: ChunkPicks;
  readonly saving: boolean;
  readonly onChoose: (index: number, pick: ChunkPick) => void;
  readonly onSave: (contents: string) => void;
}

function MergeSurface({ conflict, picks, saving, onChoose, onSave }: MergeSurfaceProps) {
  const { chunks, ours, theirs } = conflict;
  const contents = useMemo(() => mergedText(chunks, picks), [chunks, picks]);
  const segments = useMemo(() => resultSegments(chunks, picks), [chunks, picks]);
  const remaining = undecidedCount(chunks, picks);
  const settled = isSettled(chunks, picks);
  const note = noteName(ours.path);

  return (
    <section
      className="@container flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4"
      aria-label={`Compare versions of ${note}`}
    >
      <header className="rounded-small border border-border bg-card p-4">
        <h2 className="m-0 text-base font-semibold text-card-foreground">
          Two versions of this note exist
        </h2>
        <p className="mb-0 mt-1.5 text-xs leading-relaxed text-muted-foreground">
          &ldquo;{note}&rdquo; was edited on another device before this one finished syncing. Go
          through each highlighted section and choose what to keep — the rest is identical and
          already collapsed.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2">
        {[ours, theirs].map((version) => (
          <div key={version.path} className="rounded-small border border-border bg-surface px-3 py-2">
            <p className="m-0 text-xs font-semibold text-foreground">{version.label}</p>
            <p className="m-0 text-[0.7rem] text-muted-foreground">
              {describeWhen(version.changedAt)} · {describeSize(version.byteSize)}
            </p>
          </div>
        ))}
      </div>

      {conflict.kind === "binary" ? (
        <p className="m-0 rounded-small border border-border bg-card p-3 text-xs leading-relaxed text-muted-foreground">
          This file can&apos;t be compared piece by piece. Close this tab and choose a whole version
          from the list instead.
        </p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {chunks.map((chunk, index) =>
            chunk.kind === "common" ? (
              <IdenticalRun key={index} text={chunk.text} />
            ) : (
              <ChoiceRow
                key={index}
                chunk={chunk}
                ourLabel={ours.label}
                theirLabel={theirs.label}
                pick={picks.get(index)}
                onChoose={(pick) => onChoose(index, pick)}
              />
            )
          )}
        </ol>
      )}

      <section aria-label="Result" className="flex flex-col gap-1.5">
        <h3 className="m-0 text-xs font-semibold text-foreground">
          Result — this is what will be saved
        </h3>
        <pre className="m-0 overflow-x-auto whitespace-pre-wrap rounded-small border border-border bg-editor p-3 font-mono text-xs text-editor-foreground">
          {segments.map((segment) => (
            <span
              key={segment.index}
              className={
                segment.state === "pending"
                  ? "bg-warning/20 underline decoration-dotted"
                  : segment.state === "chosen"
                    ? "bg-success/15"
                    : undefined
              }
            >
              {segment.text}
            </span>
          ))}
        </pre>
      </section>

      <footer className="flex flex-col gap-2 @2xl:flex-row @2xl:items-center @2xl:justify-between">
        <p className="m-0 text-[0.7rem] text-muted-foreground">
          You can always undo — previous versions are kept in History.
        </p>
        <button
          type="button"
          className="rounded-small border border-primary bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
          disabled={!settled || saving || conflict.kind === "binary"}
          onClick={() => onSave(contents)}
        >
          {settled
            ? "Done — save merged note"
            : `${remaining} section${remaining === 1 ? "" : "s"} still to choose`}
        </button>
      </footer>
    </section>
  );
}

/** A stretch both versions agree on, collapsed to one quiet line. */
function IdenticalRun({ text }: { readonly text: string }) {
  const lines = countLines(text);
  return (
    <li className="rounded-small border border-border/60 px-3 py-1.5 text-[0.7rem] text-muted-foreground">
      {lines} identical line{lines === 1 ? "" : "s"}
    </li>
  );
}

interface ChoiceRowProps {
  readonly chunk: Extract<ConflictChunk, { kind: "choice" }>;
  readonly ourLabel: string;
  readonly theirLabel: string;
  readonly pick: ChunkPick | undefined;
  readonly onChoose: (pick: ChunkPick) => void;
}

function ChoiceRow({ chunk, ourLabel, theirLabel, pick, onChoose }: ChoiceRowProps) {
  const options: readonly { readonly pick: ChunkPick; readonly label: string }[] = [
    { pick: "ours", label: `Keep ${ourLabel.toLowerCase()}'s` },
    { pick: "theirs", label: `Keep ${theirLabel}'s` },
    { pick: "both", label: "Keep both" }
  ];

  return (
    <li className="rounded-small border border-border bg-card p-3">
      <div className="grid grid-cols-1 gap-2 @2xl:grid-cols-2">
        <Side label={ourLabel} text={chunk.ours} highlighted={pick === "ours" || pick === "both"} />
        <Side
          label={theirLabel}
          text={chunk.theirs}
          highlighted={pick === "theirs" || pick === "both"}
        />
      </div>
      <fieldset className="m-0 mt-2 flex flex-wrap gap-1.5 border-0 p-0">
        <legend className="sr-only">Which version of this section to keep</legend>
        {options.map((option) => (
          <button
            key={option.pick}
            type="button"
            aria-pressed={pick === option.pick}
            className={
              pick === option.pick
                ? "rounded-small border border-primary bg-primary px-2 py-1 text-[0.7rem] text-primary-foreground"
                : "rounded-small border border-border bg-surface px-2 py-1 text-[0.7rem] text-foreground"
            }
            onClick={() => onChoose(option.pick)}
          >
            {option.label}
          </button>
        ))}
      </fieldset>
    </li>
  );
}

function Side({
  label,
  text,
  highlighted
}: {
  readonly label: string;
  readonly text: string;
  readonly highlighted: boolean;
}) {
  return (
    <div>
      <p className="m-0 mb-1 text-[0.68rem] font-semibold text-muted-foreground">{label}</p>
      <pre
        className={`m-0 overflow-x-auto whitespace-pre-wrap rounded-small border p-2 font-mono text-xs ${
          highlighted ? "border-primary bg-primary/10" : "border-border bg-surface"
        }`}
      >
        {text === "" ? <span className="italic text-muted-foreground">Nothing here</span> : text}
      </pre>
    </div>
  );
}

function messageOf(cause: unknown): string {
  return cause instanceof NativeCommandError
    ? cause.message
    : "Something went wrong reading the two versions.";
}
