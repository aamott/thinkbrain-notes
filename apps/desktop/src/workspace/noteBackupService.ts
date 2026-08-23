/**
 * Reaching the versions the app kept before a save replaced them.
 *
 * Thin on purpose, like the conflict service: what counts as a version, where
 * they live and which ones a note may restore from are all decided in Rust,
 * because the same answers have to hold for a vault nobody has a window open
 * on — and because the path a restore reads from must be checked somewhere the
 * frontend cannot reach past.
 */

import { invokeNativeCommand, type NativeKeptVersion } from "../native/commands";

/** One version of a note the app kept before replacing it. */
export type KeptVersion = NativeKeptVersion;

/** This note's kept versions, newest first. Empty when none were kept. */
export function listNoteVersions(
  rootPath: string,
  relativePath: string
): Promise<readonly KeptVersion[]> {
  return invokeNativeCommand("list_note_versions", { rootPath, relativePath });
}

/**
 * Puts a kept version back, overwriting the note.
 *
 * The write goes through the ordinary save path, so the version being replaced
 * is itself kept — a restore is undoable, which is what lets the confirmation
 * be an honest question rather than a last chance. `versionPath` must be one of
 * the paths `listNoteVersions` returned; the native side refuses anything else.
 */
export function restoreNoteVersion(
  rootPath: string,
  relativePath: string,
  versionPath: string
): Promise<null> {
  return invokeNativeCommand("restore_note_backup", { rootPath, relativePath, versionPath });
}
