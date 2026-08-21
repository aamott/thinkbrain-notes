/**
 * Plain-language copy for bringing a notes folder in from a git link.
 */

import { validateSyncDestination } from "@thinkbrain/core";

import { recoveryFor } from "../sync/syncCopy";

export const OPEN_FOLDER_LABEL = "Open folder…";
export const IMPORT_FROM_GIT_LABEL = "Bring in from Git link…";
export const IMPORT_DIALOG_TITLE = "Bring in workspace from Git link";
export const NO_PROFILE_LABEL = "No sign-in (public or local)";

const PHASE_TEXT: Record<string, string> = {
  checking: "Checking for updates…",
  combining: "Combining changes…",
  sending: "Sending changes…",
  saving: "Saving changes…"
};

export function validateImportLink(value: string): string | null {
  if (value.trim() === "") {
    return "Paste a secret-free HTTPS git link, or a folder path to a bare repo.";
  }
  const existing = validateSyncDestination(value);
  if (existing?.includes("sign-in fields")) {
    return "Remove the username or token from this link. Choose a saved sign-in instead.";
  }
  return existing;
}

export function importPhaseText(state: string): string {
  return PHASE_TEXT[state] ?? "Bringing notes in…";
}

export function recoveryForImport(code: string): string {
  switch (code) {
    case "sync.import_target_exists":
      return "Choose another parent folder, or rename the folder that is already there.";
    case "sync.import_name_invalid":
      return "Check the git link. The last part of it has to be a usable folder name.";
    case "sync.import_parent_invalid":
      return "Choose a folder on this computer to put the new notes folder in.";
    case "sync.import_create_failed":
      return "Check that folder can be written, then try again.";
    case "sync.import_window_failed":
      return "The folder is ready. Use Open folder to open it.";
    default:
      return recoveryFor(code);
  }
}
