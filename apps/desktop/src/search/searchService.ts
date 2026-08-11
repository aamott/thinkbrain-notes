import { parseNote } from "@thinkbrain/core";
import {
  invokeNativeCommand,
  type NativeDocumentInput,
  type NativeMarkdownFileEntry,
  type NativeSearchHit
} from "../native/commands";

/** Default number of documents indexed per native `index_documents` call. */
const DEFAULT_BATCH_SIZE = 50;

/**
 * Error thrown when batch indexing is aborted via an `AbortSignal`.
 *
 * Carries the standard `name: "AbortError"` so callers can distinguish it from
 * native bridge or parse failures.
 */
export class AbortError extends Error {
  readonly name = "AbortError";

  constructor(message = "Indexing was aborted.") {
    super(message);
  }
}

/** Progress callback during batch indexing. */
export interface IndexProgress {
  readonly indexed: number;
  readonly total: number;
}

/** A search hit returned by the service. */
export interface SearchResult {
  readonly relativePath: string;
  readonly fileName: string;
  readonly title: string | null;
  readonly snippet: string;
  readonly score: number;
}

/** Options for batch indexing. */
export interface IndexOptions {
  /** Number of documents per native `index_documents` call. Defaults to 50. */
  readonly batchSize?: number;
  /** Aborts an in-flight `indexWorkspace` between batches. */
  readonly signal?: AbortSignal;
  /** Invoked after each batch with cumulative `{ indexed, total }`. */
  readonly onProgress?: (progress: IndexProgress) => void;
}

export interface SearchService {
  /** Clears any existing index and re-indexes all markdown files in the workspace. */
  indexWorkspace(
    rootPath: string,
    files: readonly NativeMarkdownFileEntry[],
    options?: IndexOptions
  ): Promise<number>;

  /** Reads, parses, and indexes a single document (incremental upsert). */
  indexDocument(rootPath: string, relativePath: string): Promise<void>;

  /** Removes a document from the index. */
  removeDocument(rootPath: string, relativePath: string): Promise<void>;

  /** Clears the entire index for a workspace. */
  clearIndex(rootPath: string): Promise<void>;

  /** Searches the index and returns ranked results. */
  search(rootPath: string, query: string, limit?: number): Promise<readonly SearchResult[]>;
}

/**
 * Builds a {@link NativeDocumentInput} from raw markdown contents.
 *
 * Parses the note to extract frontmatter title, combined tags, and aliases,
 * then maps them onto the camelCase shape expected by the native `index_documents`
 * command (serde maps these to the Rust struct's snake_case fields).
 */
function buildDocumentInput(
  relativePath: string,
  fileName: string,
  contents: string
): NativeDocumentInput {
  const parsed = parseNote(contents);
  return {
    path: relativePath,
    fileName,
    title: parsed.metadata.title,
    tags: parsed.tags,
    aliases: parsed.aliases,
    body: parsed.body
  };
}

/**
 * Maps a native search hit (snake_case) into the service's camelCase
 * {@link SearchResult}, normalizing the optional title to `string | null`.
 */
function toSearchResult(hit: NativeSearchHit): SearchResult {
  return {
    relativePath: hit.path,
    fileName: hit.file_name,
    title: hit.title ?? null,
    snippet: hit.snippet,
    score: hit.score
  };
}

/**
 * Factory that creates a {@link SearchService} backed by the real native command
 * bridge. All native IPC is routed through `invokeNativeCommand` so UI consumers
 * stay isolated from Tauri specifics.
 */
export function createSearchService(): SearchService {
  return {
    /**
     * Re-indexes an entire workspace from scratch.
     *
     * Clears the index first, then reads, parses, and batches every markdown
     * file into the FTS5 backend. Individual file read/parse failures are
     * logged and skipped so a single corrupt note cannot abort the whole index.
     * Aborts (via `signal`) and `clear_index` failures propagate loudly.
     *
     * Args:
     *   rootPath: Absolute workspace root.
     *   files: Markdown file entries to index.
     *   options: Batching, abort, and progress reporting controls.
     *
     * Returns:
     *   The total number of documents successfully indexed.
     */
    async indexWorkspace(rootPath, files, options) {
      const batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE;
      const { signal, onProgress } = options ?? {};

      // Start fresh — a failed clear is fatal and should surface immediately.
      await invokeNativeCommand("clear_index", { rootPath });

      let indexed = 0;
      for (let start = 0; start < files.length; start += batchSize) {
        // Honor abort between batches so a cancelled re-index stops promptly.
        if (signal?.aborted) {
          throw new AbortError();
        }

        const batch = files.slice(start, start + batchSize);
        const documents: NativeDocumentInput[] = [];

        for (const file of batch) {
          try {
            const { contents } = await invokeNativeCommand("read_markdown_file", {
              rootPath,
              relativePath: file.relative_path
            });
            documents.push(buildDocumentInput(file.relative_path, file.file_name, contents));
          } catch (error) {
            // Skip unreadable/unparseable notes but keep indexing the rest.
            console.warn(
              `[searchService] Skipping "${file.relative_path}" during indexing:`,
              error
            );
          }
        }

        if (documents.length > 0) {
          await invokeNativeCommand("index_documents", { rootPath, documents });
          indexed += documents.length;
        }

        // Yield to the event loop between batches to keep the UI responsive.
        await Promise.resolve();

        onProgress?.({ indexed, total: files.length });
      }

      return indexed;
    },

    async indexDocument(rootPath, relativePath) {
      const { contents } = await invokeNativeCommand("read_markdown_file", {
        rootPath,
        relativePath
      });
      const fileName = relativePath.split("/").pop() ?? relativePath;
      const document = buildDocumentInput(relativePath, fileName, contents);
      // FTS5 upsert (DELETE+INSERT) makes this safe for re-indexing existing docs.
      await invokeNativeCommand("index_documents", { rootPath, documents: [document] });
    },

    removeDocument(rootPath, relativePath) {
      return invokeNativeCommand("remove_index_document", { rootPath, path: relativePath }).then(
        () => undefined
      );
    },

    clearIndex(rootPath) {
      return invokeNativeCommand("clear_index", { rootPath }).then(() => undefined);
    },

    async search(rootPath, query, limit) {
      const hits = await invokeNativeCommand("search_index", { rootPath, query, limit });
      return hits.map(toSearchResult);
    }
  };
}
