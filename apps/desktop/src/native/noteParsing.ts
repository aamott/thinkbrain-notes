import { parseNote, type ParsedNote } from "@thinkbrain/core";
import { invokeNativeCommand } from "./commands";

/**
 * Reads and parses a single markdown file. Returns `null` (logged) on
 * read/parse failure so a single corrupt note cannot abort a whole index.
 * Checks `signal` after the read so a superseding workspace switch drops
 * stale results instead of committing them.
 */
export async function readAndParseNote(
  rootPath: string,
  relativePath: string,
  signal?: AbortSignal,
  logTag = "readAndParseNote"
): Promise<ParsedNote | null> {
  try {
    const { contents } = await invokeNativeCommand("read_markdown_file", {
      rootPath,
      relativePath
    });
    if (signal?.aborted) return null;
    return parseNote(contents);
  } catch (error) {
    console.warn(`[${logTag}] Skipping "${relativePath}" during indexing:`, error);
    return null;
  }
}
