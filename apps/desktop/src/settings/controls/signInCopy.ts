/**
 * Plain-language status for the Git-link sign-in form.
 *
 * The sentences distinguish backend availability from whether a selected
 * profile still has a secret, without git or keychain jargon.
 */

import type { SignInStatus } from "../../sync/historyTypes";

export function describeSignInStatus(status: SignInStatus): {
  readonly text: string;
  readonly role: "status" | "alert";
} {
  if (status.storage !== "available") {
    return { text: status.storageMessage, role: "alert" };
  }
  if (status.selected && status.host && status.selected.host !== status.host) {
    return {
      text: `The selected sign-in belongs to ${status.selected.host}. Choose one saved for ${status.host}, or add a new sign-in.`,
      role: "alert"
    };
  }
  if (status.selected && !status.selected.saved) {
    return {
      text: "The selected sign-in is no longer saved on this computer.",
      role: "alert"
    };
  }
  if (status.selected?.saved) {
    return { text: `Sign-in saved as ${status.selected.label}.`, role: "status" };
  }
  if (status.legacy) {
    return {
      text: "This repository has a saved sign-in from an earlier version.",
      role: "status"
    };
  }
  if (status.profiles.length === 0) {
    return {
      text: `${status.storageMessage} No sign-in is saved yet.`,
      role: "status"
    };
  }
  return {
    text: "Secure storage is available. Choose a saved sign-in or add one.",
    role: "status"
  };
}
