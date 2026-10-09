import { useEffect } from "react";

import { appEvents } from "../events/appEvents";

/**
 * Chrome and wiring the journal's two surfaces share.
 *
 * The popout and the calendar read the same folder and so can fail the same
 * three ways. The copy for those three lives here once: a folder that is
 * unreadable in the popout and unreadable in the calendar has to say the same
 * thing, and two switch statements drift (D63).
 */

/**
 * D76: touch decides the density, not width.
 *
 * A full-screen popout is about 390px across and so is a wide desktop panel, so
 * `pointer-coarse:` is what separates a thumb from a mouse. Rows keep the
 * two-line form either way; under a fingertip they clear 44px.
 */
export const TOUCH = "pointer-coarse:min-h-11 pointer-coarse:min-w-11";

export const ACTION = `h-7 ${TOUCH} px-2 rounded-small border border-border bg-background text-foreground text-xs cursor-pointer hover:bg-secondary`;

/** Approved copy (D63) — name what happened, offer the way out. */
export function EmptyState({
  title,
  body,
  actions
}: {
  readonly title: string;
  readonly body?: string;
  readonly actions: readonly {
    readonly label: string;
    readonly run: (() => void) | undefined;
  }[];
}) {
  const usable = actions.filter(
    (action): action is { label: string; run: () => void } => action.run !== undefined
  );
  return (
    <div className="flex flex-col items-start gap-2 px-3 py-4">
      <p className="m-0 text-[0.8rem] font-semibold">{title}</p>
      {body && <p className="m-0 text-xs text-muted-foreground">{body}</p>}
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        {usable.map((action) => (
          <button key={action.label} type="button" className={ACTION} onClick={action.run}>
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The three ways listing the journal folder can fail. */
export type JournalTroubleCode = "no-workspace" | "invalid-root" | "unreadable";

export interface JournalTroubleProps {
  readonly status: JournalTroubleCode;
  readonly onRetry: () => void;
  /**
   * Shell affordances the extension API does not expose yet. Omitted rather
   * than stubbed: a button that does nothing is worse than no button, and the
   * state's copy still names what went wrong.
   */
  readonly onChooseFolder?: () => void;
  readonly onOpenSettings?: () => void;
}

export function JournalTrouble({
  status,
  onRetry,
  onChooseFolder,
  onOpenSettings
}: JournalTroubleProps) {
  // Three failure modes, each with its approved copy (D63). Built per render
  // because the callbacks close over the host's affordances; the literal is the
  // single source of the copy, so the two switch statements that used to drift
  // (D63) cannot.
  const COPY: Record<JournalTroubleCode, { title: string; actions: { label: string; run: (() => void) | undefined }[] }> = {
    "no-workspace": {
      title: "Open a folder to start journaling.",
      actions: [{ label: "Open folder…", run: onChooseFolder }]
    },
    "invalid-root": {
      title: "The journal folder setting isn't a valid path.",
      actions: [{ label: "Open settings", run: onOpenSettings }]
    },
    unreadable: {
      title: "Can't read the journal folder.",
      actions: [
        { label: "Retry", run: onRetry },
        { label: "Choose a different folder…", run: onChooseFolder }
      ]
    }
  };
  return <EmptyState {...COPY[status]} />;
}

/**
 * Re-runs a listing read when the journal folder changes underneath (D68).
 *
 * Shared by the popout and the calendar so the two surfaces cannot drift on
 * which writes matter: every note goes through the workspace adapters, which
 * announce it. `note.saved` is deliberately absent — a prose edit changes no
 * listing field, and relisting on every keystroke-triggered save would churn
 * the folder while the user types.
 *
 * Not debounced. React batches the reloads that land in one task, and the app
 * has no path that writes many notes at once, so a timer would buy a saving
 * nothing can currently produce — and none of it can be pinned by a test.
 * Revisit alongside the first bulk-write feature, where the burst becomes
 * real and observable.
 */
// eslint-disable-next-line react-refresh/only-export-components -- shared hook, no JSX
export function useJournalListRefresh(reload: () => void): void {
  useEffect(() => {
    const subscriptions = (["note.created", "note.deleted", "note.renamed"] as const).map(
      (event) => appEvents.on(event, reload)
    );
    return () => {
      for (const subscription of subscriptions) void subscription.dispose();
    };
  }, [reload]);
}
