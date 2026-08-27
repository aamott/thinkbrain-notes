/**
 * Plain-language copy for bringing a notes folder in from a git link.
 */

import { validateSyncDestination } from "@thinkbrain/core";

import { recoveryFor } from "../sync/syncCopy";

export const OPEN_FOLDER_LABEL = "Open folder…";
export const CREATE_MANAGED_WORKSPACE_LABEL = "Create vault…";
export const IMPORT_FROM_GIT_LABEL = "Bring in from Git link…";
export const IMPORT_DIALOG_TITLE = "Bring in workspace from Git link";
export const NO_PROFILE_LABEL = "No sign-in (public or local)";
export const NEW_PROFILE_LABEL = "New sign-in";

export const SIGN_IN_HELP_TEXT =
  "GitHub: use your username. GitLab: use the username shown for a project token, or oauth2 for a personal token. The token is saved only in this computer's keychain.";

export function noProfilesForHost(host: string): string {
  return `No saved sign-ins for ${host} yet.`;
}

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

export function recoveryForImport(code: string, managedDestination = false): string {
  switch (code) {
    case "sync.import_target_exists":
      return managedDestination
        ? "Open the existing managed vault, or use a git link with a different repository name."
        : "Choose another parent folder, or rename the folder that is already there.";
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

