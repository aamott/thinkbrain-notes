import { parseNote, type ParsedNote } from "@thinkbrain/core";
import { invokeNativeCommand } from "./commands";

/** Exact note source paired with its parsed representation. */
export interface ParsedNoteSource {
  readonly contents: string;
  readonly parsedNote: ParsedNote;
}

/**
 * Reads and parses one Markdown file while retaining the exact source text.
 * Returns `null` after an abort or logged read/parse failure so one bad note
 * cannot abort a whole index.
 */
export async function readAndParseNoteSource(
  rootPath: string,
  relativePath: string,
  signal?: AbortSignal,
  logTag = "readAndParseNote"
): Promise<ParsedNoteSource | null> {
  try {
    const { contents } = await invokeNativeCommand("read_markdown_file", {
      rootPath,
      relativePath
    });
    if (signal?.aborted) return null;
    return { contents, parsedNote: parseNote(contents) };
  } catch (error) {
    console.warn(`[${logTag}] Skipping "${relativePath}" during indexing:`, error);
    return null;
  }
}

/** Reads and parses one Markdown file without exposing its retained source. */
export async function readAndParseNote(
  rootPath: string,
  relativePath: string,
  signal?: AbortSignal,
  logTag = "readAndParseNote"
): Promise<ParsedNote | null> {
  const source = await readAndParseNoteSource(rootPath, relativePath, signal, logTag);
  return source?.parsedNote ?? null;
}
