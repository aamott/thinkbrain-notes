import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Unavailable } from "../shell/Unavailable";
import { CodeMirrorDiff } from "./CodeMirrorDiff";
import { noteName } from "./conflictCard";
import type { VersionDiff } from "./historyTypes";
import { readVersionDiff } from "./syncService";
import { failureMessage, restoreFailureMessage } from "./syncCopy";

/**
 * One recorded version of a file against what it looks like now.
 *
 * Read-only by construction: nothing here writes the right pane — restoring
 * is a deliberate button press that goes through the native restore, which
 * checkpoints the current contents first. The comparison is drawn by the same
 * `CodeMirrorDiff` the conflict merge uses, so "Compare Diff" and this tab
 * always agree about what differs.
 */

interface VersionDiffTabProps {
  readonly rootPath: string | null;
  /** The file the recorded version is of. */
  readonly notePath: string | null;
  /** The recorded change to compare against. */
  readonly changeId: string | null;
  /**
   * Unsaved text from an editor open on this file, if there is one.
   *
   * "Current file" has to be what the user is looking at — comparing
   * against the last save would show them a file they can see is out of date.
   */
  readonly currentBuffer?: string | null;
  /**
   * Puts the recorded version back — shell-owned so an open dirty file is
   * saved before the restore is allowed to run.
   */
  readonly onRestore: (notePath: string, changeId: string) => Promise<void>;
}

type Phase =
  | { readonly at: "loading" }
  | { readonly at: "ready"; readonly diff: VersionDiff }
  | { readonly at: "restored" }
  | { readonly at: "failed"; readonly message: string };

const READ_FAILURE = "Something went wrong reading that version.";

/**
 * Starts a fresh session per comparison.
 *
 * The key is what resets the view when the tab is pointed at a different
 * recorded version, rather than an effect that has to remember to do it.
 */
export function VersionDiffTab({ rootPath, notePath, changeId, currentBuffer, onRestore }: VersionDiffTabProps) {
  if (!rootPath || !notePath || !changeId) {
    return (
      <Unavailable
        title="Nothing to compare"
        description="This tab has lost track of which version it was about."
      />
    );
  }
  return (
    <VersionDiffSession
      key={`${rootPath}:${notePath}:${changeId}`}
      rootPath={rootPath}
      notePath={notePath}
      changeId={changeId}
      currentBuffer={currentBuffer}
      onRestore={onRestore}
    />
  );
}

function VersionDiffSession({
  rootPath,
  notePath,
  changeId,
  currentBuffer,
  onRestore
}: {
  readonly rootPath: string;
  readonly notePath: string;
  readonly changeId: string;
  readonly currentBuffer?: string | null;
  readonly onRestore: (notePath: string, changeId: string) => Promise<void>;
}) {
  const [phase, setPhase] = useState<Phase>({ at: "loading" });
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  // Taken once, when the comparison is opened: "current" means the file as it
  // was on screen when the user asked to compare, not a moving target.
  const openedWith = useRef(currentBuffer);

  useEffect(() => {
    let cancelled = false;
    void readVersionDiff(rootPath, notePath, changeId, openedWith.current)
      .then((diff) => {
        if (!cancelled) setPhase({ at: "ready", diff });
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setPhase({ at: "failed", message: failureMessage(cause, READ_FAILURE) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [rootPath, notePath, changeId]);

  const restore = useCallback(async () => {
    setRestoring(true);
    setRestoreError(null);
    try {
      await onRestore(notePath, changeId);
      setPhase({ at: "restored" });
    } catch (cause) {
      setRestoreError(restoreFailureMessage(cause));
    } finally {
      setRestoring(false);
    }
  }, [onRestore, notePath, changeId]);

  if (phase.at === "loading") {
    return <Unavailable title="Opening that version" description="Reading what was saved." />;
  }
  if (phase.at === "failed") {
    return <Unavailable title="Could not open that version" description={phase.message} />;
  }
  if (phase.at === "restored") {
    return (
      <Unavailable
        title="Version restored"
        description="The file is back to how it was then. What it replaced is kept — you can always put it back from Version history."
      />
    );
  }

  return (
    <VersionDiffSurface
      diff={phase.diff}
      restoring={restoring}
      restoreError={restoreError}
      onRestore={() => void restore()}
    />
  );
}

const PRIMARY_BUTTON =
  "rounded-small border border-primary bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50";

function VersionDiffSurface({
  diff,
  restoring,
  restoreError,
  onRestore
}: {
  readonly diff: VersionDiff;
  readonly restoring: boolean;
  readonly restoreError: string | null;
  readonly onRestore: () => void;
}) {
  const name = noteName(diff.notePath);
  const headingId = useId();
  const comparable = diff.kind === "text";

  return (
    <section
      className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden p-4"
      aria-labelledby={headingId}
    >
      <header className="rounded-small border border-border bg-card p-4">
        <h2 id={headingId} className="m-0 text-base font-semibold text-card-foreground">
          Preview restore: {name}
        </h2>
        <p className="mb-0 mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {comparable
            ? "This preview shows exactly how the file will change. Restoring replaces the current file with the selected earlier version."
            : "This file's contents can't be compared line by line — they aren't text. You can still put the recorded version back below."}
        </p>
      </header>

      {restoreError !== null && (
        <p role="alert" className="m-0 rounded-small border border-danger px-3 py-2 text-xs text-danger">
          {restoreError}
        </p>
      )}

      {comparable ? (
        <>
          {/* What the two highlight colors mean, in words as well as color:
              additions are what the restore puts in, removals what it takes
              out — the diff is drawn current → recorded, so the colors follow
              the restore, not the history. */}
          <ul
            aria-label="Restore preview legend"
            className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[0.7rem]"
          >
            <li className="text-success">+ Added by restore</li>
            <li className="text-danger">− Removed by restore</li>
          </ul>
          {/* A floor keeps the diff usable on a very short screen — the
              section scrolls instead of the comparison collapsing away. */}
          <div className="flex min-h-56 min-w-0 max-w-full flex-1 flex-col overflow-hidden">
            <CodeMirrorDiff
              before={diff.text.current}
              after={diff.text.recorded}
              beforeLabel="Current file"
              afterLabel="After restore"
              relativePath={diff.notePath}
              editableAfter={false}
              ariaLabel={`Current file versus after restore for ${name}`}
            />
          </div>
        </>
      ) : (
        <p className="m-0 rounded-small border border-border bg-card p-3 text-xs leading-relaxed text-muted-foreground">
          No visual comparison is available for this file.
        </p>
      )}

      <footer className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="m-0 text-[0.7rem] text-muted-foreground">
          Putting this version back first saves a checkpoint of what it replaces, so you can always
          undo.
        </p>
        <button
          type="button"
          className={PRIMARY_BUTTON}
          disabled={restoring}
          onClick={onRestore}
        >
          Restore this version
        </button>
      </footer>
    </section>
  );
}
