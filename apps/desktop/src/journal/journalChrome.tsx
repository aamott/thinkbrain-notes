/**
 * Chrome the journal's two surfaces share.
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
export const TOUCH = "pointer-coarse:min-h-11";

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
  switch (status) {
    case "no-workspace":
      return (
        <EmptyState
          title="Open a folder to start journaling."
          actions={[{ label: "Open folder…", run: onChooseFolder }]}
        />
      );
    case "invalid-root":
      return (
        <EmptyState
          title="The journal folder setting isn't a valid path."
          actions={[{ label: "Open settings", run: onOpenSettings }]}
        />
      );
    case "unreadable":
      return (
        <EmptyState
          title="Can't read the journal folder."
          actions={[
            { label: "Retry", run: onRetry },
            { label: "Choose a different folder…", run: onChooseFolder }
          ]}
        />
      );
  }
}
