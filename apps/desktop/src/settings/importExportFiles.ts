import { pickFilePath, saveFilePath } from "../native/dialogs";
import { readTextFileNative, writeTextFileNative } from "../native/fs";

/**
 * The file half of import and export, shared by settings and themes.
 *
 * Both features do the same two things — put a JSON document somewhere the user
 * chose, and read one back — and both used to hand the caller a single falsy
 * value for two unrelated outcomes. Dismissing a dialog and a write that failed
 * are not the same event: one deserves silence, the other has to be said out
 * loud (AGENTS.md, fail loudly). Keeping the distinction in one place is what
 * stops the two features from drifting apart on it again.
 *
 * The convention here: the falsy return means the user cancelled, and anything
 * that actually went wrong throws.
 */

/**
 * Asks for a path and writes `json` to it.
 *
 * Returns `false` when the user dismissed the dialog. Throws when a path was
 * chosen and the write did not happen.
 */
export async function writeJsonViaSaveDialog(
  title: string,
  defaultName: string,
  json: string
): Promise<boolean> {
  const path = await saveFilePath(title, defaultName);
  if (path === null) return false;

  const written = await writeTextFileNative(path, json);
  if (!written) {
    throw new Error(`The file could not be written to "${path}".`);
  }
  return true;
}

/** A file the user chose, and what was in it. */
export interface PickedFile {
  readonly path: string;
  readonly contents: string;
}

/**
 * Asks for a file and returns it with its contents.
 *
 * The path comes back alongside the contents because importing a theme records
 * where it came from, not just what it said.
 *
 * Returns `null` when the user dismissed the dialog. Throws when a file was
 * chosen and could not be read — a missing or unreadable file is something the
 * user needs told, not an empty import.
 */
export async function readPickedFile(
  title: string,
  extensions?: readonly string[]
): Promise<PickedFile | null> {
  const path = await pickFilePath(title, extensions);
  if (path === null) return null;

  const contents = await readTextFileNative(path);
  if (contents === null) {
    throw new Error(`The file "${path}" could not be read.`);
  }
  return { path, contents };
}
