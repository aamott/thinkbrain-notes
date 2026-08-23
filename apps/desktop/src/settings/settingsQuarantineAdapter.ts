/**
 * Quarantined settings → notification adapter.
 *
 * The fourth producer wired into the notification store, and the one that
 * closes `data-safety/settings_survive_a_downgrade`: an unparseable settings
 * document has been set aside rather than overwritten since that story, but the
 * app only said so on stderr. From inside the app the user's theme, workspace
 * and tabs simply reverted to defaults with no explanation — which is the same
 * experience as the data loss the story was written to stop.
 *
 * Design:
 * - **Sticky**, unlike the sync producers. The user has lost their settings and
 *   the file holding them is recoverable only while they know it exists; a
 *   toast that clears itself after eight seconds is how that goes unnoticed.
 *   Rare enough — this fires only on a genuinely corrupt document — that
 *   ranking above the transient producers costs them nothing in practice.
 * - **Reads once per window.** The native side records quarantines for the life
 *   of the process, so this needs no subscription: whatever happened during
 *   startup is already there by the time the shell mounts.
 * - The path travels in `details` rather than the message. It is long, it is
 *   the one thing worth copying, and the bell log already offers Copy.
 */

import { useEffect } from "react";

import { invokeNativeCommand } from "../native/commands";
import { useNotificationStore } from "../notifications/notificationStore";

/** Source tag for quarantine announcements. */
export const SETTINGS_QUARANTINE_SOURCE = "settings-quarantine";

/**
 * Tells the user, once, if a settings document was set aside this run.
 *
 * Mount once in the shell. Silent when nothing was quarantined, which is
 * every ordinary launch.
 */
export function useSettingsQuarantineAdapter(): void {
  const addNotification = useNotificationStore((state) => state.addNotification);

  useEffect(() => {
    let cancelled = false;
    void invokeNativeCommand("quarantined_settings")
      .then((paths) => {
        if (cancelled || paths.length === 0) return;
        addNotification({
          source: SETTINGS_QUARANTINE_SOURCE,
          dedupKey: `${SETTINGS_QUARANTINE_SOURCE}:announced`,
          title:
            paths.length === 1
              ? "A settings file could not be read"
              : `${paths.length} settings files could not be read`,
          message:
            "The app started with default settings. Nothing was deleted — the file was kept.",
          recovery: "You can send the kept file to us, or edit it and put it back.",
          details: paths.join("\n"),
          severity: "sticky",
          variant: "warning"
        });
      })
      .catch((cause: unknown) => {
        // Failing to ask is not itself worth a notification: the user did not
        // ask, and an ordinary launch has nothing to report anyway.
        console.debug("[settings] could not check for set-aside documents", cause);
      });
    return () => {
      cancelled = true;
    };
  }, [addNotification]);
}
