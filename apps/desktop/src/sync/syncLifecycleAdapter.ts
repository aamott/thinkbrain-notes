/**
 * Tells the native side when the app is going away, so it can push what was
 * written before the system freezes the process.
 *
 * Coming back is deliberately not reported. The sweeper thread resumes with
 * the process and reaches the same decision within a tick, and a lifecycle
 * command that starts a sync the sweeper is about to start anyway is a second
 * implementation of the schedule — which is how the two drifted apart before.
 *
 * `visibilitychange` also means different things on the two platforms: a phone
 * leaving the foreground, a desktop window being minimised. Only the leaving
 * half is worth acting on, and `blur` is not a substitute — pushing on every
 * alt-tab is nobody's idea of a sync policy.
 */
import { useEffect } from "react";

import { invokeNativeCommand } from "../native/commands";

/** Tells the native side the app is going away. */
export async function reportHidden(state: DocumentVisibilityState): Promise<void> {
  if (state !== "hidden") {
    return;
  }
  try {
    await invokeNativeCommand("sync_app_backgrounded");
  } catch {
    // A lifecycle event is not something the user asked for, so a failure here
    // is not something to interrupt them about. `invokeNativeCommand` already
    // logs it (commands.ts: `logCommandFailure`) before rethrowing.
  }
}

/** Mounts the listener for the life of the app. */
export function useSyncLifecycleAdapter(): void {
  useEffect(() => {
    const onChange = () => void reportHidden(document.visibilityState);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
}
