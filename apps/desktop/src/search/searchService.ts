import { type IndexMetadataValue, type ParsedNote } from "@thinkbrain/core";
import {
  invokeNativeCommand,
  type NativeDocumentInput,
  type NativeMarkdownFileEntry,
  type NativeMetadataQueryResult,
  type NativeSearchHit
} from "../native/commands";
import { readAndParseNote } from "../native/noteParsing";

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

export interface MetadataPredicate {
  readonly key: string;
  readonly value: IndexMetadataValue;
}

export interface MetadataQuery {
  readonly pathPrefix: string;
  readonly facetKeys: readonly string[];
  readonly predicates: readonly MetadataPredicate[];
}

export interface MetadataFacet {
  readonly key: string;
  readonly values: readonly IndexMetadataValue[];
}

export interface MetadataQueryData {
  readonly facets: readonly MetadataFacet[];
  readonly matchingPaths: readonly string[];
}

/** Narrows what a single search asks the index about. */
export interface SearchOptions {
  /**
   * Workspace-relative folder to search inside; absent searches the whole
   * vault, which is what a search box over a workspace wants.
   *
   * A caller with a folder in mind has to say so here rather than filter the
   * results, because {@link SearchOptions.limit} is applied by the query: a
   * folder holding a small share of the vault's notes would otherwise be
   * outranked out of its own results.
   */
  readonly pathPrefix?: string;
  /** Maximum hits to return. The native side defaults to 50 and caps at 200. */
  readonly limit?: number;
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
  search(
    rootPath: string,
    query: string,
    options?: SearchOptions
  ): Promise<readonly SearchResult[]>;

  queryMetadata(rootPath: string, query: MetadataQuery): Promise<MetadataQueryData>;
}

/**
 * Builds a {@link NativeDocumentInput} from a parsed note.
 *
 * Maps the parsed note's frontmatter title, combined tags, and aliases onto
 * the camelCase shape expected by the native `index_documents` command (serde
 * maps these to the Rust struct's snake_case fields).
 */
function buildDocumentInput(
  relativePath: string,
  fileName: string,
  parsed: ParsedNote
): NativeDocumentInput {
  return {
    path: relativePath,
    fileName,
    title: parsed.metadata.title,
    tags: parsed.tags,
    aliases: parsed.aliases,
    body: parsed.body,
    metadata: parsed.indexMetadata
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

function toMetadataQueryData(result: NativeMetadataQueryResult): MetadataQueryData {
  return {
    facets: result.facets,
    matchingPaths: result.matching_paths
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

        // The reads within a batch are independent, so they go out together.
        // Awaited one at a time, time-to-searchable grew with the note count
        // rather than with the batch count — a round trip per note on the path
        // that runs every time a workspace opens.
        const read = await Promise.all(
          batch.map(async (file): Promise<NativeDocumentInput | null> => {
            const parsed = await readAndParseNote(
              rootPath,
              file.relative_path,
              signal,
              "searchService"
            );
            return parsed === null
              ? null
              : buildDocumentInput(file.relative_path, file.file_name, parsed);
          })
        );
        const documents = read.filter((document): document is NativeDocumentInput => document !== null);

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
      const parsed = await readAndParseNote(rootPath, relativePath, undefined, "searchService");
      if (parsed === null) return;
      const fileName = relativePath.split("/").pop() ?? relativePath;
      const document = buildDocumentInput(relativePath, fileName, parsed);
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

    async search(rootPath, query, options) {
      const hits = await invokeNativeCommand("search_index", {
        rootPath,
        query,
        pathPrefix: options?.pathPrefix,
        limit: options?.limit
      });
      return hits.map(toSearchResult);
    },

    async queryMetadata(rootPath, query) {
      const result = await invokeNativeCommand("query_index_metadata", {
        rootPath,
        pathPrefix: query.pathPrefix,
        facetKeys: query.facetKeys,
        predicates: query.predicates
      });
      return toMetadataQueryData(result);
    }
  };
}

/**
 * The app's search service.
 *
 * One instance: it holds no state of its own beyond the native calls it makes,
 * and a second would only make it ambiguous which one a caller meant.
 */
export const searchService: SearchService = createSearchService();
