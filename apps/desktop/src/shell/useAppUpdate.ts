import { useCallback, useEffect, useRef, useState } from "react";

/**
 * An update the host has found and can install.
 *
 * Structurally what `@tauri-apps/plugin-updater`'s `check()` resolves to, named
 * here so this module — and its tests — never import Tauri. The adapter that
 * does live in {@link ./appUpdater}.
 */
export interface AvailableUpdate {
  readonly version: string;
  downloadAndInstall(): Promise<void>;
}

export type UpdateState =
  | { readonly kind: "none" }
  | { readonly kind: "available"; readonly version: string }
  | { readonly kind: "installing" }
  | { readonly kind: "failed"; readonly message: string };

/**
 * Looks once for a newer version, and installs it when the user says so.
 *
 * Checks on mount and never again: an app that is open for a week does not need
 * to interrupt on day three, and the next launch will find whatever it missed.
 * A `null` check is the honest state on a build with no updater wired in —
 * mobile, or a dev run — and does nothing at all rather than pretending.
 *
 * A failed *check* stays silent. The user did not ask for it and cannot act on
 * it, and a notice on every offline launch is how the one that matters gets
 * ignored. A failed *install* is said out loud, because they pressed a button.
 */
export function useAppUpdate(
  check: (() => Promise<AvailableUpdate | null>) | null,
  relaunch: () => Promise<void>
): {
  readonly state: UpdateState;
  readonly install: () => void;
  readonly dismiss: () => void;
} {
  const [state, setState] = useState<UpdateState>({ kind: "none" });
  const found = useRef<AvailableUpdate | null>(null);

  useEffect(() => {
    if (check === null) return;

    let active = true;
    void check()
      .then((update) => {
        if (!active || update === null) return;
        found.current = update;
        setState({ kind: "available", version: update.version });
      })
      .catch(() => {
        // Deliberately silent; see the note above.
      });

    return () => {
      active = false;
    };
  }, [check]);

  const install = useCallback(() => {
    const update = found.current;
    if (update === null) return;

    setState({ kind: "installing" });
    void update
      .downloadAndInstall()
      .then(relaunch)
      .catch((error: unknown) => {
        // No relaunch on this path: restarting into a half-written install is
        // how a working app becomes one that will not open.
        setState({
          kind: "failed",
          message: error instanceof Error ? error.message : String(error)
        });
      });
  }, [relaunch]);

  const dismiss = useCallback(() => {
    found.current = null;
    setState({ kind: "none" });
  }, []);

  return { state, install, dismiss };
}
