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
 * A destination someone pasted, or the empty "sync nowhere" sentinel.
 *
 * Accepts an http(s)/ssh/git/file URL, an SCP-style `user@host:path` remote,
 * or a local folder. Whitespace-only is not empty: empty is a choice, spaces
 * are a typo. Tokens embedded in a URL are valid here and stay off portable
 * export because the setting is workspace-scoped and `portable: false`.
 */
export function validateSyncDestination(value: unknown): string | null {
  if (typeof value !== "string") {
    return "Paste a link, or leave this empty.";
  }
  if (value === "") return null;
  const trimmed = value.trim();
  if (trimmed === "") {
    return "Leave this empty, or paste a link.";
  }
  if (looksLikeRemoteUrl(trimmed) || looksLikeScpRemote(trimmed) || looksLikeLocalRemote(trimmed)) {
    return null;
  }
  return "Paste a link (https://… or user@host:path), or leave this empty.";
}

function looksLikeRemoteUrl(value: string): boolean {
  try {
    return Boolean(new URL(value).protocol);
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
      label: "Conflicts",
      settings: [
        {
          key: "settleAutomatically",
          type: "boolean",
          default: DEFAULT_SETTLE_AUTOMATICALLY,
          scope: "app",
          section: "sync.conflicts",
          label: "Settle obvious conflicts without asking",
          description:
            "When another device's copy of a note is identical to yours, or holds a version yours has already been through, keep yours and tidy the copy away. Earlier versions stay in History either way. Turn this off to be asked about every copy."
        }
      ]
    },
    {
      id: "sync.destination",
      label: "Another device",
      settings: [
        {
          key: "destination",
          type: "string",
          default: "",
          scope: "workspace",
          section: "sync.destination",
          label: "Keep these notes in step with",
          description:
            "A place these notes are kept in step with — paste the link it gives you. Leave it empty and nothing leaves this device. Earlier versions and conflicts work the same either way.",
          portable: false,
          validation: validateSyncDestination
        }
      ]
    }
  ]
};
