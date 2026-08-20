import { useCallback, useEffect, useState } from "react";

import { NativeCommandError } from "../native/commands";
import { Unavailable } from "../shell/Unavailable";
import { describeSize, describeWhen, noteName, treatmentOf } from "./conflictCard";
import { listConflicts, resolveConflict } from "./conflictService";
import type { ConflictResolution, ConflictSummary } from "./conflictTypes";
import { recoveryFor } from "./syncCopy";
import { useSyncStatus } from "./useSyncStatus";

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
   * Reads the list and writes both halves of the result into state.
   *
   * The single source of truth for refreshing the panel: the initial read,
   * change subscription, and decisions all funnel through here, so they all see
   * the same error handling and the same ordering of `setState` calls.
   */
  const reload = useCallback(async (): Promise<void> => {
    if (!rootPath) return;
    try {
      setConflicts(await listConflicts(rootPath));
      setError(null);
    } catch (cause) {
      setError(messageOf(cause, "The list of items to review could not be read."));
    }
  }, [rootPath]);

  useEffect(() => {
    const refresh = (): void => {
      void reload();
    };
    refresh();
  }, [reload]);

  const { stuck } = useSyncStatus(rootPath, reload);

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
      await reload();
      if (failure) setError(failure);
      setBusy(null);
    },
    [reload, rootPath]
  );

  if (!rootPath) {
    return <Unavailable title="No workspace open" description="Open a workspace to see anything waiting for you." />;
  }

  if (conflicts.length === 0 && stuck.length === 0 && !error) {
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
        {stuck.map((note) => (
          <li key={note.path} className="rounded-small border border-border bg-card p-3">
            <h4 className="m-0 break-words text-xs font-semibold text-card-foreground">{noteName(note.path)}</h4>
            <p className="mb-2 mt-0.5 text-[0.7rem] text-muted-foreground">Could not be kept in step</p>
            <p className="mb-0 mt-0 text-[0.7rem] leading-relaxed text-muted-foreground">
              {note.message} {recoveryFor(note.code)}
            </p>
          </li>
        ))}
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
  if (cause instanceof NativeCommandError) return cause.message;
  // A non-native failure is still worth a trail: the user sees the stable
  // fallback, but a persistent cause nobody logged is one nobody can trace.
  console.error("[sync] conflict operation failed:", cause);
  return fallback;
}
