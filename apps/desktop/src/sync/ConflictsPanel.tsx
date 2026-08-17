import { useCallback, useEffect, useState } from "react";

import { NativeCommandError } from "../native/commands";
import { Unavailable } from "../shell/Unavailable";
import { describeSize, describeWhen, noteName, treatmentOf } from "./conflictCard";
import { listConflicts, resolveConflict, subscribeToConflictChanges } from "./conflictService";
import type { ConflictResolution, ConflictSummary } from "./conflictTypes";

/**
 * The notes that changed in two places, and what to do about each one.
 *
 * A triage list rather than a merge tool: most conflicts are not interesting
 * enough to open — a picture the user recognises, a board they know they
 * redrew — and answering those from the card is the difference between a
 * two-second job and a screen full of columns.
 *
 * Nothing here is destructive without a restore point. Every button below ends
 * in the same native call, which checkpoints both versions before it writes.
 */

/** One read of the list: either what it holds, or why it could not be read. */
interface Read {
  readonly conflicts: readonly ConflictSummary[] | null;
  readonly error: string | null;
}

interface ConflictsPanelProps {
  readonly rootPath: string | null;
  /** Opens the side-by-side comparison, named by the copy and the note it is of. */
  readonly onReview: (copyPath: string, notePath: string) => void;
}

export function ConflictsPanel({ rootPath, onReview }: ConflictsPanelProps) {
  const [conflicts, setConflicts] = useState<readonly ConflictSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  /**
   * Reads the list, changing nothing.
   *
   * Kept free of state so it can be called from anywhere — an effect, a click
   * handler — without the caller having to reason about when React will see the
   * result. {@link apply} is the only thing that writes.
   */
  const read = useCallback(async (): Promise<Read | null> => {
    if (!rootPath) return null;
    try {
      return { conflicts: await listConflicts(rootPath), error: null };
    } catch (cause) {
      return {
        conflicts: null,
        error: messageOf(cause, "The list of items to review could not be read.")
      };
    }
  }, [rootPath]);

  const apply = useCallback((result: Read | null) => {
    if (!result) return;
    if (result.conflicts) setConflicts(result.conflicts);
    setError(result.error);
  }, []);

  // One effect for the first read and for every one after it. The native side
  // announces both halves of a change — a daemon dropping a new copy, and
  // another window settling one — and both belong on this list.
  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | null = null;
    const reload = () => {
      void read().then((result) => {
        if (!cancelled) apply(result);
      });
    };

    reload();
    void subscribeToConflictChanges(reload).then((unlisten) => {
      if (cancelled) unlisten();
      else stop = unlisten;
    });

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [apply, read]);

  const decide = useCallback(
    async (summary: ConflictSummary, resolution: ConflictResolution) => {
      if (!rootPath) return;
      setBusy(summary.theirs.path);
      let failure: string | null = null;
      try {
        await resolveConflict(rootPath, summary, resolution);
      } catch (cause) {
        failure = messageOf(cause, "That version could not be saved. Nothing was changed.");
      }
      // Always re-read, and always after the attempt: a refused decision leaves
      // the card exactly where it was, which the user should see for themselves.
      // The report comes last because the re-read clears the previous one, and a
      // failure the list overwrote would be a failure nobody was told about.
      apply(await read());
      if (failure) setError(failure);
      setBusy(null);
    },
    [apply, read, rootPath]
  );

  if (!rootPath) {
    return <Unavailable title="No workspace open" description="Open a workspace to see anything waiting for you." />;
  }

  if (conflicts.length === 0 && !error) {
    return (
      <Unavailable
        title="Nothing needs your attention"
        description="When the same note is changed on two devices, both versions will show up here."
      />
    );
  }

  return (
    <section className="@container flex min-h-0 flex-1 flex-col overflow-y-auto" aria-label="Items to review">
      <header className="border-b border-border px-3 py-3">
        <h3 className="m-0 text-sm font-semibold text-foreground">Needs your attention</h3>
        <p className="mb-0 mt-1 text-xs leading-relaxed text-muted-foreground">
          These notes changed on more than one device. Take a look and choose which version to keep —
          nothing is deleted until you decide.
        </p>
      </header>

      {error !== null && (
        <p role="alert" className="m-3 rounded-small border border-danger px-2 py-1.5 text-xs text-danger">
          {error}
        </p>
      )}

      <ul className="m-0 flex list-none flex-col gap-2 p-3">
        {conflicts.map((conflict) => (
          <ConflictCard
            key={conflict.theirs.path}
            conflict={conflict}
            busy={busy === conflict.theirs.path}
            onReview={() => onReview(conflict.theirs.path, conflict.ours.path)}
            onDecide={(resolution) => void decide(conflict, resolution)}
          />
        ))}
      </ul>
    </section>
  );
}

interface ConflictCardProps {
  readonly conflict: ConflictSummary;
  readonly busy: boolean;
  readonly onReview: () => void;
  readonly onDecide: (resolution: ConflictResolution) => void;
}

const CARD_BUTTON =
  "rounded-small border border-border bg-surface px-2 py-1 text-xs text-foreground disabled:opacity-50";
const CARD_BUTTON_PRIMARY =
  "rounded-small border border-primary bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50";

function ConflictCard({ conflict, busy, onReview, onDecide }: ConflictCardProps) {
  const treatment = treatmentOf(conflict);
  const name = noteName(conflict.ours.path);

  return (
    <li className="rounded-small border border-border bg-card p-3">
      <h4 className="m-0 break-words text-xs font-semibold text-card-foreground">{name}</h4>
      <p className="mb-2 mt-0.5 text-[0.7rem] text-muted-foreground">Edited in two places</p>

      <p className="mb-2 mt-0 text-[0.7rem] text-muted-foreground">
        Synced via {conflict.theirs.label}
      </p>

      {treatment === "whiteboard" && (
        <p className="mb-2 mt-0 text-[0.7rem] leading-relaxed text-muted-foreground">
          Visual compare isn&apos;t available yet for whiteboards. You can keep whichever version you
          trust more, or keep both as separate boards.
        </p>
      )}

      {treatment !== "review" && (
        <dl className="m-0 mb-2 grid grid-cols-2 gap-2 text-[0.7rem]">
          {[conflict.ours, conflict.theirs].map((version) => (
            <div key={version.path}>
              <dt className="font-semibold text-foreground">{version.label}</dt>
              <dd className="m-0 text-muted-foreground">
                {describeSize(version.byteSize)} · {describeWhen(version.changedAt)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className="flex flex-col gap-1.5 @xs:flex-row">
        {treatment === "review" ? (
          <button type="button" className={CARD_BUTTON_PRIMARY} onClick={onReview} disabled={busy}>
            Review
          </button>
        ) : (
          <>
            <button
              type="button"
              className={CARD_BUTTON}
              onClick={() => onDecide({ kind: "keepOurs" })}
              disabled={busy}
            >
              Keep {conflict.ours.label.toLowerCase()}&apos;s
            </button>
            <button
              type="button"
              className={CARD_BUTTON}
              onClick={() => onDecide({ kind: "keepTheirs" })}
              disabled={busy}
            >
              Keep {conflict.theirs.label}&apos;s
            </button>
          </>
        )}
        <button
          type="button"
          className={CARD_BUTTON}
          onClick={() => onDecide({ kind: "keepBoth" })}
          disabled={busy}
        >
          Keep both
        </button>
      </div>
    </li>
  );
}

function messageOf(cause: unknown, fallback: string): string {
  return cause instanceof NativeCommandError ? cause.message : fallback;
}
