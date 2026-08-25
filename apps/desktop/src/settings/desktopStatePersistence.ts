/**
 * Fire-and-forget desktop-state persistence with observable failures.
 *
 * Wraps {@link saveDesktopState} / {@link loadDesktopState} so callers do not
 * have to choose between suppressing errors (the old `.catch(() => undefined)`)
 * and breaking the shell's responsiveness. A failed save or read is logged and
 * surfaced as a deduplicated notification through the existing notification
 * store — repeated failures update the same entry rather than flooding the
 * bell — while the call site keeps its fire-and-forget shape.
 *
 * Non-Tauri (web dev) sessions are skipped: there is no app-settings file to
 * read or write, so attempting the IPC would only produce noise.
 */

import { isTauri } from "@tauri-apps/api/core";

import { useNotificationStore } from "../notifications/notificationStore";
import {
  DEFAULT_DESKTOP_STATE,
  loadDesktopState,
  saveDesktopState,
  type DesktopState,
  type DesktopStateGateway,
  type DesktopStateUpdate
} from "./desktopState";

/** Notification source tag for desktop-state persistence failures. */
export const DESKTOP_STATE_SOURCE = "desktop-state";

/** Dedup keys: a recurring failure updates the existing entry in place. */
const SAVE_FAILURE_DEDUP_KEY = `${DESKTOP_STATE_SOURCE}:save-failed`;
const LOAD_FAILURE_DEDUP_KEY = `${DESKTOP_STATE_SOURCE}:load-failed`;

/**
 * Fires a desktop-state save without blocking the caller.
 *
 * Failures are logged and reported as a sticky notification (data-loss risk),
 * deduplicated so a burst of failed writes produces one entry, not many.
 * Non-Tauri sessions are a no-op.
 */
export function persistDesktopState(
  update: DesktopStateUpdate,
  gateway?: DesktopStateGateway
): void {
  if (!isTauri()) return;
  void saveDesktopState(update, gateway).catch(reportSaveFailure);
}

/**
 * Reads desktop state, reporting a failure as a transient notification before
 * returning safe defaults.
 *
 * Use this when a caller wants the value and is happy to fall back to defaults
 * on failure (the restore path). Callers that handle the fallback themselves
 * (e.g. keeping in-memory state on a focus-refresh failure) should call
 * {@link loadDesktopState} directly and pass the error to
 * {@link reportDesktopStateReadFailure} in their own `.catch`.
 */
export function readDesktopState(
  gateway?: DesktopStateGateway
): Promise<DesktopState> {
  if (!isTauri()) return Promise.resolve(DEFAULT_DESKTOP_STATE);
  return loadDesktopState(gateway).catch((error: unknown) => {
    reportLoadFailure(error);
    return DEFAULT_DESKTOP_STATE;
  });
}

/**
 * Reports a desktop-state read failure without swallowing it.
 *
 * For callers that handle the fallback themselves but still want the failure to
 * be observable. Deduplicated so a recurring read problem is one entry.
 */
export function reportDesktopStateReadFailure(error: unknown): void {
  reportLoadFailure(error);
}

/** Logs and notifies a save failure (sticky — data-loss risk). */
function reportSaveFailure(error: unknown): void {
  console.error("[desktop-state] save failed", error);
  useNotificationStore.getState().addNotification({
    source: DESKTOP_STATE_SOURCE,
    dedupKey: SAVE_FAILURE_DEDUP_KEY,
    title: "Could not save workspace state",
    message:
      "Recent workspaces, open tabs, or panel layout may not be remembered.",
    recovery:
      "Check that the app settings file is writable and the disk has space.",
    details: describeError(error),
    severity: "sticky",
    variant: "error"
  });
}

/** Logs and notifies a read failure (transient — falls back to defaults). */
function reportLoadFailure(error: unknown): void {
  console.warn("[desktop-state] load failed", error);
  useNotificationStore.getState().addNotification({
    source: DESKTOP_STATE_SOURCE,
    dedupKey: LOAD_FAILURE_DEDUP_KEY,
    title: "Could not read workspace state",
    message:
      "Open tabs, panel layout, or recent workspaces may not be restored.",
    recovery: "The next successful save replaces the unread document.",
    details: describeError(error),
    severity: "transient",
    variant: "warning"
  });
}

/** Reduces an unknown error to a single diagnostic line for the notification. */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}
