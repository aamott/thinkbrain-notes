/**
 * Reports app lifecycle to the native side so it can decide whether to sync.
 *
 * Deliberately thin: this file knows *that* the app came back, never *which*
 * vaults that affects. The registry on the native side already holds every
 * open workspace, and putting the decision here would mean policy in two
 * places and would only ever cover whichever vault the current view knew
 * about.
 */
import { useEffect } from "react";

import { invokeNativeCommand } from "../native/commands";

export async function reportVisibility(state: DocumentVisibilityState): Promise<void> {
  try {
    await invokeNativeCommand(
      state === "visible" ? "sync_app_foregrounded" : "sync_app_backgrounded"
    );
  } catch {
    // A lifecycle event is not something the user asked for, so a failure
    // here is not something to interrupt them about. `invokeNativeCommand`
    // already logs the failure (commands.ts: `logCommandFailure`) before
    // rethrowing, so nothing is lost by swallowing it here.
  }
}

/** Mounts the listener for the life of the app. */
export function useSyncTriggerAdapter(): void {
  useEffect(() => {
    const onChange = () => void reportVisibility(document.visibilityState);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
}
