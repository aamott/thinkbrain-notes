/**
 * Built-in Auto Sync module.
 *
 * Two scopes, deliberately. How much the app is trusted to decide on someone's
 * behalf is an `"app"` preference — someone who wants to be asked about every
 * copy wants that in every folder, not one at a time. Where a folder syncs to
 * is a fact about that folder, so it is `"workspace"`.
 */

import type { SettingsModule } from "../types";

/**
 * Default for `settleAutomatically`. Repeated on the native side as
 * `SETTLE_BY_DEFAULT` in `apps/desktop/src-tauri/src/commands/sync/settle.rs`,
 * because native has to answer the same question before any window is
 * listening. Changing one means changing the other.
 */
export const DEFAULT_SETTLE_AUTOMATICALLY = true;

/**
 * A git link someone pasted, or the empty "sync nowhere" sentinel.
 *
 * Accepts an http(s)/ssh/git/file URL, an SCP-style `user@host:path` remote,
 * or a local path to a bare git repo. Whitespace-only is not empty: empty is a
 * choice, spaces are a typo. Credentials are deliberately not valid here:
 * username and token go straight to the OS keychain from the settings form.
 */
export function validateSyncDestination(value: unknown): string | null {
  if (typeof value !== "string") {
    return "Paste a git link or a folder path to a bare repo, or leave this empty.";
  }
  if (value === "") return null;
  const trimmed = value.trim();
  if (trimmed === "") {
    return "Leave this empty, or paste a git link or a folder path to a bare repo.";
  }
  if (hasHttpCredentials(trimmed)) {
    return "Remove the username or token from this link. Enter them in the sign-in fields below.";
  }
  if (looksLikeRemoteUrl(trimmed) || looksLikeScpRemote(trimmed) || looksLikeLocalRemote(trimmed)) {
    return null;
  }
  return "Paste a git link (https://…) or a folder path to a bare repo, or leave this empty.";
}

function looksLikeRemoteUrl(value: string): boolean {
  try {
    return ["http:", "https:", "ssh:", "git:", "file:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function hasHttpCredentials(value: string): boolean {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && (url.username !== "" || url.password !== "");
  } catch {
    return false;
  }
}

/** SCP-like `user@host:path` / `host:path` — not `git@host` (no path). */
function looksLikeScpRemote(value: string): boolean {
  return /^(?:[^/\s@]+@)?[^/\s:]+:\S+$/.test(value);
}

function looksLikeLocalRemote(value: string): boolean {
  return (
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    /^[A-Za-z]:[\\/]/.test(value)
  );
}

/**
 * Auto Sync preferences.
 *
 * `settleAutomatically` defaults to `true`, which is the unusual direction for
 * a default that writes to someone's notes — the justification is that what it
 * settles is provably not a decision. A copy identical to the note, or one
 * holding a version the note has already been through, contains nothing that
 * could be lost by discarding it, and every one of them is checkpointed first.
 * Anything a base would be needed to judge is still asked about.
 */
export const syncModule: SettingsModule = {
  id: "sync",
  label: "Sync",
  scope: "app",
  sections: [
    {
      id: "sync.conflicts",
      label: "Cloud copies",
      settings: [
        {
          key: "settleAutomatically",
          type: "boolean",
          default: DEFAULT_SETTLE_AUTOMATICALLY,
          scope: "app",
          section: "sync.conflicts",
          label: "Settle obvious conflicts without asking",
          description:
            "If this folder is in OneDrive, Google Drive, or Syncthing, those apps sometimes leave an extra copy beside a note. When that copy is identical to yours, or holds a version yours has already been through, keep yours and tidy the copy away. It still shows up under Two versions until then. Earlier versions stay in Saved versions either way. Turn this off to be asked about every copy."
        }
      ]
    },
    {
      id: "sync.destination",
      label: "Git link",
      settings: [
        {
          key: "destination",
          type: "string",
          default: "",
          scope: "workspace",
          section: "sync.destination",
          label: "Git link",
          description:
            "An https:// link to GitHub, GitLab, or similar — or a folder path to a bare git repo on this computer or a NAS. Leave empty for this device only. Enter the username and access token below; they are saved in this computer's keychain, never in this link.",
          control: "sync-git-link",
          portable: false,
          validation: validateSyncDestination
        }
      ]
    }
  ]
};
