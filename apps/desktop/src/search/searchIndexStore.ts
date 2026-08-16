/**
 * Zustand store for the workspace search index lifecycle.
 *
 * Owns the index status (no-workspace / indexing / ready / error) and the
 * current workspace root, and drives the {@link SearchService} for full and
 * incremental indexing. App-wide note mutation events are wired through
 * {@link subscribeToEvents} so the FTS5 cache stays in sync with
 * create/save/rename/delete, whether the app made the change or the native
 * watcher saw somebody else make it.
 *
 * The store is deliberately thin: heavy lifting (batching, parsing, native IPC)
 * lives in `searchService`. UI consumers (e.g. `SearchPanel`) read `status` to
 * decide what to render and only fire queries once the index is `ready`.
 */

import { create } from "zustand";
import { subscribeIndexToNoteEvents } from "../events/noteIndexSubscription";
import type { NativeMarkdownFileEntry } from "../native/commands";
import {
  AbortError,
  searchService,
  type IndexProgress,
  type MetadataQuery,
  type MetadataQueryData
} from "./searchService";

export type {
  IndexProgress,
  MetadataFacet,
  MetadataPredicate,
  MetadataQuery,
  MetadataQueryData
} from "./searchService";

/** Lifecycle status of the search index for the current workspace. */
export type SearchIndexStatus =
  | { readonly kind: "no-workspace" }
  | { readonly kind: "indexing"; readonly progress: IndexProgress | null }
  | { readonly kind: "ready" }
  | { readonly kind: "error"; readonly message: string };

export type MetadataIndexQueryResult =
  | ({ readonly kind: "available" } & MetadataQueryData)
  | {
      readonly kind: "unavailable";
      readonly reason: "no-workspace" | "indexing" | "workspace-mismatch";
    }
  | { readonly kind: "failure"; readonly message: string };

/** State + actions exposed by the search index store. */
export interface SearchIndexStore {
  /** Current index lifecycle status. */
  readonly status: SearchIndexStatus;
  /** Workspace root the index covers, or `null` when no workspace is open. */
  readonly rootPath: string | null;

  /** Clears any existing index and re-indexes all markdown files in the workspace. */
  indexWorkspace(rootPath: string, files: readonly NativeMarkdownFileEntry[]): Promise<void>;
  /** Resets to no-workspace and clears the index for the previous root, if any. */
  clearWorkspace(): void;
  /** Incrementally re-indexes a single document (upsert). */
  reindexDocument(rootPath: string, relativePath: string): Promise<void>;
  /** Removes a document from the index. */
  removeDocument(rootPath: string, relativePath: string): Promise<void>;
  /** Removes the old path and indexes the new one for a renamed/moved note. */
  reindexRenamedDocument(
    rootPath: string,
    oldRelativePath: string,
    newRelativePath: string
  ): Promise<void>;
  queryMetadata(rootPath: string, query: MetadataQuery): Promise<MetadataIndexQueryResult>;
  /**
   * Subscribes to app-wide note mutation events and keeps the index in sync.
   * Idempotent: calling it again disposes the previous subscription before
   * creating a new one, so React 18 strict-mode double-mount does not leak
   * listeners. Returns a disposal function that unsubscribes all listeners.
   */
  subscribeToEvents(): () => void;
}

/**
 * Tracks the in-flight full-index operation so a workspace switch can abort it.
 * Kept outside Zustand state because `AbortController` is mutable/non-serializable.
 */
let indexingAbortController: AbortController | null = null;

/**
 * Tracks the current event subscription so `subscribeToEvents` is idempotent.
 * A second call disposes the first before creating a new one, preventing
 * React 18 strict-mode double-mount from leaking listeners.
 */
let currentSubscription: (() => void) | null = null;

export const useSearchIndexStore = create<SearchIndexStore>((set, get) => ({
  status: { kind: "no-workspace" },
  rootPath: null,

  async indexWorkspace(rootPath, files) {
    // Abort any in-flight indexing from a previous workspace before starting.
    indexingAbortController?.abort();
    const controller = new AbortController();
    indexingAbortController = controller;

    set({ rootPath, status: { kind: "indexing", progress: null } });
    try {
      await searchService.indexWorkspace(rootPath, files, {
        signal: controller.signal,
        // Only forward progress while we're still indexing this workspace; a
        // superseding open/close must not be clobbered by a stale callback.
        onProgress: (progress) => {
          if (indexingAbortController === controller && get().rootPath === rootPath) {
            set({ status: { kind: "indexing", progress } });
          }
        }
      });
      // Guard against a superseding workspace switch overwriting stale success.
      if (indexingAbortController === controller && get().rootPath === rootPath) {
        set({ status: { kind: "ready" } });
      }
    } catch (error) {
      // Abort is expected when a newer indexing operation superseded this one.
      if (error instanceof AbortError) return;
      if (indexingAbortController === controller && get().rootPath === rootPath) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[searchIndexStore] Indexing failed:", error);
        set({ status: { kind: "error", message } });
      }
    } finally {
      if (indexingAbortController === controller) {
        indexingAbortController = null;
      }
    }
  },

  clearWorkspace() {
    indexingAbortController?.abort();
    indexingAbortController = null;
    const { rootPath } = get();
    if (rootPath) {
      // Best-effort clear; a failure here is non-fatal since the cache is disposable.
      searchService.clearIndex(rootPath).catch((error) => {
        console.warn("[searchIndexStore] Failed to clear index on workspace close:", error);
      });
    }
    set({ status: { kind: "no-workspace" }, rootPath: null });
  },

  async reindexDocument(rootPath, relativePath) {
    if (get().rootPath !== rootPath) return;
    try {
      await searchService.indexDocument(rootPath, relativePath);
    } catch (error) {
      console.error(`[searchIndexStore] Failed to reindex "${relativePath}":`, error);
    }
  },

  async removeDocument(rootPath, relativePath) {
    if (get().rootPath !== rootPath) return;
    try {
      await searchService.removeDocument(rootPath, relativePath);
    } catch (error) {
      console.error(`[searchIndexStore] Failed to remove "${relativePath}" from index:`, error);
    }
  },

  async reindexRenamedDocument(rootPath, oldRelativePath, newRelativePath) {
    if (get().rootPath !== rootPath) return;
    try {
      await searchService.removeDocument(rootPath, oldRelativePath);
      await searchService.indexDocument(rootPath, newRelativePath);
    } catch (error) {
      console.error(
        `[searchIndexStore] Failed to reindex renamed "${oldRelativePath}" -> "${newRelativePath}":`,
        error
      );
    }
  },

  async queryMetadata(rootPath, query) {
    const availability = metadataQueryAvailability(get(), rootPath);
    if (availability) return availability;

    try {
      const result = await searchService.queryMetadata(rootPath, query);
      const currentAvailability = metadataQueryAvailability(get(), rootPath);
      return currentAvailability ?? { kind: "available", ...result };
    } catch (error) {
      const currentAvailability = metadataQueryAvailability(get(), rootPath);
      if (currentAvailability) return currentAvailability;
      const message = error instanceof Error ? error.message : String(error);
      console.error("[searchIndexStore] Metadata query failed:", error);
      return { kind: "failure", message };
    }
  },

  subscribeToEvents() {
    // Dispose any existing subscription before creating a new one.
    if (currentSubscription) currentSubscription();

    const dispose = subscribeIndexToNoteEvents(get);
    currentSubscription = dispose;
    return () => {
      dispose();
      currentSubscription = null;
    };
  }
}));

function metadataQueryAvailability(
  state: Pick<SearchIndexStore, "rootPath" | "status">,
  rootPath: string
): Exclude<MetadataIndexQueryResult, { readonly kind: "available" }> | null {
  if (state.rootPath === null || state.status.kind === "no-workspace") {
    return { kind: "unavailable", reason: "no-workspace" };
  }
  if (state.rootPath !== rootPath) {
    return { kind: "unavailable", reason: "workspace-mismatch" };
  }
  if (state.status.kind === "error") {
    return { kind: "failure", message: state.status.message };
  }
  if (state.status.kind === "indexing") {
    return { kind: "unavailable", reason: "indexing" };
  }
  return null;
}
