import type { ReactNode } from "react";

/**
 * One entry-point action on the new-tab page.
 *
 * The actions are supplied by the chrome because they navigate differently:
 * the desktop runs shell commands and opens the palette, while the phone
 * pushes routes onto its navigation stack.
 */
export interface NewTabAction {
  readonly id: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly onSelect: () => void;
}

/**
 * The blank landing tab — the browser's "New Tab" page.
 *
 * Deliberately sparse: a workspace identity and a row of entry points. It is
 * a starting place, not a dashboard — anything heavier belongs in a panel.
 */
export function NewTabView({
  workspaceName,
  actions
}: {
  readonly workspaceName: string | null;
  readonly actions: readonly NewTabAction[];
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 bg-editor p-8">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span
          aria-hidden="true"
          className="inline-flex size-5 items-center justify-center rounded-small bg-primary text-[0.7rem] font-extrabold text-primary-foreground"
        >
          T
        </span>
        <span className="text-sm font-medium">{workspaceName ?? "ThinkBrain"}</span>
      </div>
      <div className="flex flex-wrap items-stretch justify-center gap-2">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={action.onSelect}
            className="flex cursor-pointer items-center gap-2 rounded-medium border border-border bg-surface px-4 py-2.5 text-sm text-foreground hover:bg-secondary tn-focus-ring pointer-coarse:px-5 pointer-coarse:py-3"
          >
            {action.icon}
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
