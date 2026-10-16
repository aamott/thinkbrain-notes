import { useCallback, useEffect, useState } from "react";

import type { EventSubscriber } from "@thinkbrain/core";
import type { AppEvents } from "../events/appEvents";
import {
  JOURNAL_ERROR_TITLES,
  JournalError,
  type JournalErrorCode,
  type JournalListing,
  type JournalService
} from "./journalService";
import type { JournalStatus } from "./journalViewModel";

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

/** The three ways listing the journal folder can fail — the service's error codes. */
export type JournalTroubleCode = JournalErrorCode;

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
  // Actions are built per render because they close over the host's
  // affordances; the titles come from the service so the copy cannot drift
  // between the error and the state that shows it (D63).
  const ACTIONS: Record<JournalTroubleCode, { label: string; run: (() => void) | undefined }[]> = {
    "no-workspace": [{ label: "Open folder…", run: onChooseFolder }],
    "invalid-root": [{ label: "Open settings", run: onOpenSettings }],
    unreadable: [
      { label: "Retry", run: onRetry },
      { label: "Choose a different folder…", run: onChooseFolder }
    ]
  };
  return <EmptyState title={JOURNAL_ERROR_TITLES[status]} actions={ACTIONS[status]} />;
}

/**
 * The folder read both journal surfaces share: `listEntries`, the
 * `JournalError` → status mapping, and a cancelled-flag effect that re-runs
 * when `key` or the reload token changes. `key` is the listing's identity —
 * a kept-mounted panel surviving a workspace switch re-reads rather than
 * showing the last vault's entries.
 */
// eslint-disable-next-line react-refresh/only-export-components -- shared hook, no JSX
export function useJournalListing(
  service: JournalService,
  key?: unknown
): {
  readonly status: JournalStatus;
  readonly listing: JournalListing | null;
  /** Re-reads the folder, after an action changed it or a read failed. */
  readonly reload: () => void;
  /** Back to loading and a fresh read, for the failure states' Retry. */
  readonly retry: () => void;
} {
  const [state, setState] = useState<{ status: JournalStatus; listing: JournalListing | null }>({
    status: "loading",
    listing: null
  });
  const [reloadToken, setReloadToken] = useState(0);

  /** Reads the folder without touching state, so the effect owns when to apply it. */
  const read = useCallback(async () => {
    try {
      return { status: "ready" as const, listing: await service.listEntries() };
    } catch (error: unknown) {
      // The service already turned this into approved copy (D63); the surface
      // only needs to know which state to draw.
      return {
        status: error instanceof JournalError ? error.code : ("unreadable" as const),
        listing: null
      };
    }
  }, [service]);

  useEffect(() => {
    // A workspace switch can land while a read is in flight; the stale result
    // must not overwrite the newer one.
    let cancelled = false;
    void read().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [read, reloadToken, key]);

  // Stable identity: containers' note-event subscriptions key on it.
  const reload = useCallback((): void => setReloadToken((token) => token + 1), []);
  const retry = useCallback((): void => {
    setState((current) => ({ ...current, status: "loading" }));
    reload();
  }, [reload]);

  return { status: state.status, listing: state.listing, reload, retry };
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
 * The bus comes in as a parameter — `context.events` for the extension, so
 * the subscriptions die with its activation rather than outliving it.
 *
 * Not debounced. React batches the reloads that land in one task, and the app
 * has no path that writes many notes at once, so a timer would buy a saving
 * nothing can currently produce — and none of it can be pinned by a test.
 * Revisit alongside the first bulk-write feature, where the burst becomes
 * real and observable.
 */
// eslint-disable-next-line react-refresh/only-export-components -- shared hook, no JSX
export function useJournalListRefresh(
  reload: () => void,
  events: EventSubscriber<AppEvents>
): void {
  useEffect(() => {
    const subscriptions = (["note.created", "note.deleted", "note.renamed"] as const).map(
      (event) => events.on(event, reload)
    );
    return () => {
      for (const subscription of subscriptions) void subscription.dispose();
    };
  }, [reload, events]);
}
