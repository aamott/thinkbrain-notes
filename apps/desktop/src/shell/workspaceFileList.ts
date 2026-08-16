import type { NativeMarkdownFileEntry } from "../native/commands";

/**
 * The shell's list of the workspace's notes.
 *
 * Separate from the search and wiki-link indexes, which keep their own copies
 * and hear about changes through their own subscriptions. This one backs the
 * command palette, so it has to follow the same note events — including the
 * ones the file watcher raises for edits made outside the app, or a note that
 * arrives with a `git pull` would be searchable but not openable by name.
 */

/**
 * Adds `relativePath` unless it is already listed.
 *
 * Size and timestamp are unknown from an event alone. Nothing reading this list
 * uses them, and the next full listing fills them in.
 */
export function addWorkspaceFile(
  files: readonly NativeMarkdownFileEntry[],
  relativePath: string
): readonly NativeMarkdownFileEntry[] {
  if (files.some((file) => file.relative_path === relativePath)) return files;
  return [
    ...files,
    {
      relative_path: relativePath,
      file_name: relativePath.split("/").at(-1) ?? relativePath,
      parent_path: relativePath.split("/").slice(0, -1).join("/"),
      byte_size: 0,
      updated_at: null
    }
  ];
}

/** Drops `relativePath`, returning the same list when it was not there. */
export function removeWorkspaceFile(
  files: readonly NativeMarkdownFileEntry[],
  relativePath: string
): readonly NativeMarkdownFileEntry[] {
  const next = files.filter((file) => file.relative_path !== relativePath);
  return next.length === files.length ? files : next;
}
