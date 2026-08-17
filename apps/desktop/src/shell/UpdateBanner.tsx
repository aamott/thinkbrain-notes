import { ArrowDownToLine } from "lucide-react";

import type { UpdateState } from "./useAppUpdate";

/**
 * Offers a newer version, once, without taking over.
 *
 * Modelled on {@link StaleDocumentBanner}: the user did not ask for this and may
 * be mid-sentence, so it neither takes nor traps focus, and `role="status"` lets
 * a screen reader announce it politely. Unlike that banner nothing is at stake
 * here, so "Not now" really is the end of it for this session.
 *
 * The live region is always rendered, empty when there is nothing to offer, for
 * two reasons. The shell lays its rows out in a fixed grid, and a component that
 * renders nothing does not merely disappear — it gives up its row, and every row
 * below slides into the wrong one. And a screen reader that meets a live region
 * and its content in the same update commonly announces neither; the region has
 * to be there first.
 */
export function UpdateBanner({
  state,
  onInstall,
  onDismiss
}: {
  readonly state: UpdateState;
  /** Downloads, installs, and restarts into the new version. */
  readonly onInstall: () => void;
  /** Stops asking until the next launch. */
  readonly onDismiss: () => void;
}) {
  const busy = state.kind === "installing";

  return (
    <div role="status" aria-live="polite" aria-busy={busy}>
      {state.kind !== "none" && (
        <div className="flex flex-wrap items-center gap-3 py-[0.6rem] px-[0.9rem] border-b border-primary/40 bg-primary/10">
          <ArrowDownToLine className="shrink-0 size-[1.05rem] text-primary" aria-hidden="true" />
          <p className="flex-1 min-w-3xs m-0 text-xs text-foreground">
            {state.kind === "available" && (
              <>
                <b className="font-semibold">Version {state.version} is available.</b>{" "}
                <span className="block text-muted-foreground text-[0.7rem]">
                  Installing it restarts the app, so save anything you are partway
                  through first.
                </span>
              </>
            )}
            {busy && <b className="font-semibold">Installing the update…</b>}
            {state.kind === "failed" && (
              <>
                <b className="font-semibold">The update could not be installed.</b>{" "}
                <span className="block text-muted-foreground text-[0.7rem]">
                  {state.message} Nothing has changed — this version still works.
                </span>
              </>
            )}
          </p>
          {state.kind !== "installing" && (
            <span className="flex shrink-0 gap-[0.4rem]">
              <button
                type="button"
                className="border border-border rounded-small py-[0.28rem] px-[0.6rem] text-foreground bg-surface cursor-pointer font-inherit text-[0.72rem]"
                onClick={onDismiss}
              >
                {state.kind === "failed" ? "Dismiss" : "Not now"}
              </button>
              {state.kind === "available" && (
                <button
                  type="button"
                  className="border border-primary rounded-small py-[0.28rem] px-[0.6rem] text-primary-foreground bg-primary cursor-pointer font-inherit text-[0.72rem]"
                  onClick={onInstall}
                >
                  Install and restart
                </button>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
