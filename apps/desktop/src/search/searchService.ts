import { parseNote, type MarkdownFileEntry } from "@thinkbrain/core";

import {
  invokeNativeCommand,
  type NativeDocumentInput,
  type NativeSearchHit
} from "../native/commands";
import { readMarkdownFile } from "../workspace/workspaceService";

/** A search match shaped for the frontend (camelCase, nullable title). */
export interface SearchResult {
  readonly path: string;
  readonly fileName: string;
  readonly title: string | null;
  readonly snippet: string;
  readonly score: number;
}

/** Progress callback payload emitted while a workspace is (re)indexed. */
export interface IndexProgress {
  readonly indexed: number;
  readonly total: number;
}

export interface IndexWorkspaceOptions {
  /** Aborts the run between batches (e.g. when the workspace changes). */
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: IndexProgress) => void;
  readonly batchSize?: number;
}

/** Raised when indexing is aborted via an {@link AbortSignal}. */
export class IndexCancelledError extends Error {
  constructor() {
    super("Workspace indexing was cancelled.");
    this.name = "IndexCancelledError";
  }
}

// Files are read and pushed to the native index in modest batches so the main
// thread can paint between chunks instead of freezing on large vaults.
const DEFAULT_INDEX_BATCH_SIZE = 25;
const DEFAULT_SEARCH_LIMIT = 50;

/**
 * Converts parsed note contents into a native index record.
 *
 * Reuses the shared core parser so frontmatter, tags (including inline `#tags`),
 * and aliases are never reimplemented in the desktop layer.
 *
 * Args:
 *   file: Workspace file entry providing the path and display name.
 *   contents: Raw Markdown file contents.
 *
 * Returns:
 *   A record ready to send to the `index_documents` command.
 */
export function buildDocumentRecord(
  file: MarkdownFileEntry,
  contents: string
): NativeDocumentInput {
  const parsed = parseNote(contents);
  const rawTitle = parsed.metadata.title;
  const title =
    typeof rawTitle === "string" && rawTitle.length > 0 ? rawTitle : undefined;

  return {
    path: file.relativePath,
    fileName: file.fileName,
    title,
    tags: parsed.tags,
    aliases: parsed.aliases,
    body: parsed.body
  };
}

/**
 * Rebuilds the workspace index in the background without blocking the editor.
 *
 * Clears the cache first so renamed/deleted files do not linger, then reads and
 * indexes files in batches, yielding to the event loop between each batch.
 *
 * Args:
 *   rootPath: Absolute workspace root path.
 *   files: Markdown files to index.
 *   options: Optional cancellation signal, progress callback, and batch size.
 *
 * Returns:
 *   The number of documents indexed.
 */
export async function indexWorkspace(
  rootPath: string,
  files: readonly MarkdownFileEntry[],
  options: IndexWorkspaceOptions = {}
): Promise<number> {
  const {
    signal,
    onProgress,
    batchSize = DEFAULT_INDEX_BATCH_SIZE
  } = options;

  throwIfAborted(signal);
  await invokeNativeCommand("clear_index", { rootPath });

  const total = files.length;
  let indexed = 0;
  onProgress?.({ indexed, total });

  for (let start = 0; start < total; start += batchSize) {
    throwIfAborted(signal);

    const slice = files.slice(start, start + batchSize);
    const records = await Promise.all(
      slice.map(async (file) => {
        const loaded = await readMarkdownFile(rootPath, file.relativePath);
        return buildDocumentRecord(file, loaded.contents);
      })
    );

    throwIfAborted(signal);
    await invokeNativeCommand("index_documents", { rootPath, documents: records });

    indexed += records.length;
    onProgress?.({ indexed, total });
    await yieldToEventLoop();
  }

  return indexed;
}

/**
 * Runs a ranked search against the native FTS5 index.
 *
 * Args:
 *   rootPath: Absolute workspace root path.
 *   query: Raw user query text (sanitized natively).
 *   limit: Maximum number of matches to return.
 *
 * Returns:
 *   Ranked search results (best match first).
 */
export async function searchWorkspace(
  rootPath: string,
  query: string,
  limit: number = DEFAULT_SEARCH_LIMIT
): Promise<SearchResult[]> {
  const hits = await invokeNativeCommand("search_index", {
    rootPath,
    query,
    limit
  });

  return hits.map(toSearchResult);
}

/** Upserts a single document, keeping the index fresh after edits. */
export async function indexDocument(
  rootPath: string,
  file: MarkdownFileEntry,
  contents: string
): Promise<void> {
  await invokeNativeCommand("index_documents", {
    rootPath,
    documents: [buildDocumentRecord(file, contents)]
  });
}

/** Removes a single document from the index by workspace-relative path. */
export async function removeIndexedDocument(
  rootPath: string,
  path: string
): Promise<void> {
  await invokeNativeCommand("remove_index_document", { rootPath, path });
}

function toSearchResult(hit: NativeSearchHit): SearchResult {
  return {
    path: hit.path,
    fileName: hit.file_name,
    title: hit.title ?? null,
    snippet: hit.snippet,
    score: hit.score
  };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new IndexCancelledError();
  }
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
