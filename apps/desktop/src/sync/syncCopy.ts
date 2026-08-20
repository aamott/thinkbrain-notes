/**
 * The words the history and status surfaces say.
 *
 * Pure, and tested as prose. Every sentence here is read by someone who has
 * never heard of a commit, so the vocabulary is saving, recording and putting
 * back — and a failure is never reported without something to do about it.
 */

import { describeWhen } from "./conflictCard";
import type { ChangedNote, ConflictRate, Synced, SyncStatus } from "./historyTypes";

/** How loudly the footer should say it. */
export type PillTone = "quiet" | "busy" | "warn";

export interface PillCopy {
  readonly symbol: string;
  /** What fits in the footer. */
  readonly text: string;
  /** The whole of it, for the tooltip and for screen readers. */
  readonly detail: string;
  readonly tone: PillTone;
}

/** `${n} ${n === 1 ? singular : plural}`, with plural defaulting to singular + "s". */
function plural(n: number, singular: string, pluralForm: string = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

function clockOf(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function startOfDay(at: Date): number {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
}

/**
 * When something happened, the way someone would say it out loud.
 *
 * "Today 9:31 AM" rather than a date, for as long as a day name is the more
 * useful of the two. Past that it falls back to the same format the conflict
 * columns use, so the two surfaces do not date things differently.
 */
export function describeMoment(at: number | null, now: Date = new Date()): string {
  if (at === null) return "Unknown";
  const today = startOfDay(now);
  if (at >= today) return `Today ${clockOf(at)}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (at >= startOfDay(yesterday)) return `Yesterday ${clockOf(at)}`;
  return describeWhen(at);
}

/** How much one recorded change touched. */
export function describeWhatChanged(notes: readonly ChangedNote[]): string {
  const kind = new Set(notes.map((note) => note.change));
  const description =
    kind.size !== 1 ? "changed" : kind.has("removed") ? "deleted" : kind.has("added") ? "added" : "updated";
  return `${plural(notes.length, "note")} ${description}`;
}

/**
 * What to do about a failure to record.
 *
 * Every branch names an action, including the one for a code nobody planned
 * for. A message that only says something broke leaves the reader with the
 * problem and no move.
 */
export function recoveryFor(code: string): string {
  switch (code) {
    case "sync.auth_required":
      return "Use a remote that does not require a sign-in, or sign in when remote authentication is available.";
    case "sync.note_read_failed":
    case "sync.vault_read_failed":
      return "Check the notes folder is still connected, then edit any note to try again.";
    case "sync.note_write_failed":
      return "Check this note can be saved on this computer — a name Windows refuses, or a folder sitting where the note belongs — then bring these notes in step again.";
    case "sync.vault_too_deep":
      return "Some folders here are nested too deeply to keep track of. Move them nearer the top of the folder and open it again.";
    case "sync.vault_too_many_entries":
      return "There are too many files here to keep track of. Open a smaller folder, or split this one up.";
    case "sync.repo_create_failed":
    case "sync.repo_open_failed":
    case "sync.exclude_write_failed":
      return "Check this computer has space left, then close this folder and open it again.";
    case "sync.note_store_failed":
    case "sync.tree_write_failed":
    case "sync.commit_failed":
      return "Check this computer has space left, then edit any note to try again.";
    default:
      return "Close this folder and open it again to start saving versions.";
  }
}

/**
 * How often this folder has needed something of its user, and how often it
 * did not.
 *
 * The second number is the point: someone who sees "47 tidied away, none for
 * you" learns that the app is absorbing the noise, which is the whole promise
 * of settling the obvious ones.
 */
export function describeConflictRate(rate: ConflictRate): string {
  const versions = plural(rate.recorded, "saved version");
  const tidied =
    rate.settled === 0
      ? ""
      : ` ${rate.settled} duplicate cop${rate.settled === 1 ? "y was" : "ies were"} tidied away without asking.`;

  if (rate.decisions === 0) {
    return `${versions}, and you have never had to choose between two of them.${tidied}`;
  }
  const asked = `${rate.decisions} of them needed you to choose between two copies of a note.`;
  return `${versions}. ${asked}${tidied}`;
}

/**
 * The sentence a folder that keeps its own version history gets, appended to
 * whatever else the footer had to say.
 *
 * Deliberately not a warning. Nothing is wrong, and nothing of theirs is
 * touched — it is only that two things are keeping history here, and finding
 * that out by accident is worse than being told.
 */
const ALONGSIDE_OWN_GIT =
  "This folder also keeps its own version history, which is left exactly as it is.";

/** What the footer says about a workspace. */
export function describePill(status: SyncStatus, now: Date = new Date()): PillCopy {
  const pill = pillFor(status, now);
  return status.alongsideOwnGit
    ? { ...pill, detail: `${pill.detail} ${ALONGSIDE_OWN_GIT}` }
    : pill;
}

function pillFor(status: SyncStatus, now: Date): PillCopy {
  switch (status.state) {
    case "off":
      // The alongside-git sentence is appended by `describePill`, which owns
      // that concern across every state — saying it here too doubles it up.
      return {
        symbol: "—",
        text: "Versions not saved here",
        detail: "Versions of your notes are not being saved here.",
        tone: "quiet"
      };
    case "problem": {
      const message = status.problem?.message ?? "Versions of your notes are not being saved.";
      return {
        symbol: "⚠",
        // Not "stopped": this is also what a folder that could never be set up
        // says, and telling someone saving stopped when it never started sends
        // them looking for the moment it broke.
        text: "Not saving versions",
        detail: `${message} ${recoveryFor(status.problem?.code ?? "")}`,
        tone: "warn"
      };
    }
    case "attention": {
      const text = `${plural(status.attention, "item needs", "items need")} your attention`;
      return {
        symbol: "⚠",
        text,
        detail: `${text}. The same note was changed in two places — open the list to choose what to keep.`,
        tone: "warn"
      };
    }
    case "saving":
      return {
        symbol: "↻",
        text: "Saving…",
        detail: "Recent changes are being saved to this folder's version history.",
        tone: "busy"
      };
    case "syncing":
      return {
        symbol: "↻",
        text: "Bringing notes in step…",
        detail: "These notes are being brought in step with your other devices.",
        tone: "busy"
      };
    case "idle": {
      const when = status.lastRecordedAt;
      return {
        symbol: "✓",
        text: when === null ? "Nothing to save yet" : `All saved · ${describeMoment(when, now)}`,
        detail:
          when === null
            ? "Nothing has been edited yet, so there is nothing to save."
            : `Everything is saved. The last change was saved ${describeMoment(when, now).toLowerCase()}.`,
        tone: "quiet"
      };
    }
  }
}

/**
 * What one round trip did, in a sentence someone can act on.
 *
 * A refusal is not a failure to report as one: it means another device got
 * there first, and the only thing to do is wait a moment. Saying "rejected"
 * would send someone looking for a problem that is not theirs.
 */
export function describeSync(done: Synced): string {
  if (done.landed.state === "refused") {
    // The reason is carried across IPC for diagnostics; the UI gives a stable
    // message, but leave a trail so a refusal can be traced if it persists.
    console.debug("[sync] refused:", done.landed.reason);
    return "Another device was sending its own changes at the same time. Try again in a moment.";
  }

  const arrived =
    done.broughtDown > 0
      ? `${plural(done.broughtDown, "note")} arrived from another device.`
      : null;
  const toChoose =
    done.askedAbout > 0
      ? `${plural(done.askedAbout, "note needs", "notes need")} you to choose between two versions.`
      : null;

  if (!arrived && !toChoose) return "Everything here is already in step with your other devices.";
  return [arrived, toChoose].filter(Boolean).join(" ");
}
