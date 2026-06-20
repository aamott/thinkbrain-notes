import { create } from "zustand";
import type { MarkdownFileEntry, WorkspaceDescriptor } from "@thinkbrain/core";

import type { NativeCommandErrorShape, ShellStatus } from "../native/commands";
import type { SearchResult } from "../search/searchService";

export type NativeShellState =
  | { readonly status: "idle" }
  | { readonly status: "checking" }
  | { readonly status: "ready"; readonly shell: ShellStatus }
  | { readonly status: "error"; readonly error: NativeCommandErrorShape };

export type WorkspaceState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | {
      readonly status: "ready";
      readonly workspace: WorkspaceDescriptor;
      readonly files: readonly MarkdownFileEntry[];
    }
  | { readonly status: "error"; readonly error: NativeCommandErrorShape };

export type ActiveDocumentStatus =
  | "idle"
  | "loading"
  | "ready"
  | "saving"
  | "error";

export interface ActiveDocumentFile {
  readonly rootPath: string;
  readonly relativePath: string;
  readonly fileName: string;
}

export interface ActiveDocumentState {
  readonly status: ActiveDocumentStatus;
  readonly file: ActiveDocumentFile | null;
  readonly savedContents: string;
  readonly editorContents: string;
  readonly isDirty: boolean;
  readonly error: NativeCommandErrorShape | null;
}

/** Which primary side panel the activity bar currently shows. */
export type ActivePanel = "explorer" | "search";

export type IndexingStatus = "idle" | "indexing" | "ready" | "error";

export interface IndexingState {
  readonly status: IndexingStatus;
  readonly indexed: number;
  readonly total: number;
  readonly error: NativeCommandErrorShape | null;
}

export type SearchStatus = "idle" | "searching" | "ready" | "error";

export interface SearchState {
  readonly query: string;
  readonly status: SearchStatus;
  readonly results: readonly SearchResult[];
  readonly error: NativeCommandErrorShape | null;
}

export interface AppStoreState {
  readonly bootChecks: number;
  readonly nativeShell: NativeShellState;
  readonly workspace: WorkspaceState;
  readonly activeDocument: ActiveDocumentState;
  readonly activePanel: ActivePanel;
  readonly indexing: IndexingState;
  readonly search: SearchState;
  readonly recordBootCheck: () => void;
  readonly resetBootChecks: () => void;
  readonly setNativeShellChecking: () => void;
  readonly setNativeShellReady: (shell: ShellStatus) => void;
  readonly setNativeShellError: (error: NativeCommandErrorShape) => void;
  readonly setWorkspaceLoading: () => void;
  readonly setWorkspaceReady: (
    workspace: WorkspaceDescriptor,
    files: readonly MarkdownFileEntry[]
  ) => void;
  readonly setWorkspaceError: (error: NativeCommandErrorShape) => void;
  readonly setWorkspaceFiles: (files: readonly MarkdownFileEntry[]) => void;
  readonly openActiveDocument: (file: ActiveDocumentFile) => void;
  readonly setActiveDocumentLoaded: (contents: string) => void;
  readonly updateActiveDocumentContents: (contents: string) => void;
  readonly setActiveDocumentSaving: () => void;
  readonly markActiveDocumentSaved: (savedContents: string) => void;
  readonly setActiveDocumentError: (error: NativeCommandErrorShape) => void;
  readonly setActivePanel: (panel: ActivePanel) => void;
  readonly startIndexing: (total: number) => void;
  readonly setIndexingProgress: (indexed: number, total: number) => void;
  readonly finishIndexing: (indexed: number) => void;
  readonly setIndexingError: (error: NativeCommandErrorShape) => void;
  readonly resetIndexAndSearch: () => void;
  readonly setSearchQuery: (query: string) => void;
  readonly setSearchPending: () => void;
  readonly setSearchResults: (
    query: string,
    results: readonly SearchResult[]
  ) => void;
  readonly setSearchError: (
    query: string,
    error: NativeCommandErrorShape
  ) => void;
}

const idleIndexingState: IndexingState = {
  status: "idle",
  indexed: 0,
  total: 0,
  error: null
};

const idleSearchState: SearchState = {
  query: "",
  status: "idle",
  results: [],
  error: null
};

export const useAppStore = create<AppStoreState>((set) => ({
  bootChecks: 0,
  nativeShell: { status: "idle" },
  workspace: { status: "idle" },
  activeDocument: {
    status: "idle",
    file: null,
    savedContents: "",
    editorContents: "",
    isDirty: false,
    error: null
  },
  activePanel: "explorer",
  indexing: idleIndexingState,
  search: idleSearchState,
  recordBootCheck: () =>
    set((state) => ({ bootChecks: state.bootChecks + 1 })),
  resetBootChecks: () => set({ bootChecks: 0 }),
  setNativeShellChecking: () => set({ nativeShell: { status: "checking" } }),
  setNativeShellReady: (shell) =>
    set({ nativeShell: { status: "ready", shell } }),
  setNativeShellError: (error) =>
    set({ nativeShell: { status: "error", error } }),
  setWorkspaceLoading: () => set({ workspace: { status: "loading" } }),
  setWorkspaceReady: (workspace, files) =>
    set({ workspace: { status: "ready", workspace, files } }),
  setWorkspaceError: (error) =>
    set({ workspace: { status: "error", error } }),
  setWorkspaceFiles: (files) =>
    set((state) =>
      state.workspace.status === "ready"
        ? {
            workspace: {
              ...state.workspace,
              files
            }
          }
        : state
    ),
  openActiveDocument: (file) =>
    set({
      activeDocument: {
        status: "loading",
        file,
        savedContents: "",
        editorContents: "",
        isDirty: false,
        error: null
      }
    }),
  setActiveDocumentLoaded: (contents) =>
    set((state) =>
      state.activeDocument.file
        ? {
            activeDocument: {
              ...state.activeDocument,
              status: "ready",
              savedContents: contents,
              editorContents: contents,
              isDirty: false,
              error: null
            }
          }
        : state
    ),
  updateActiveDocumentContents: (contents) =>
    set((state) =>
      state.activeDocument.file
        ? {
            activeDocument: {
              ...state.activeDocument,
              status:
                state.activeDocument.status === "loading" ||
                state.activeDocument.status === "saving"
                  ? state.activeDocument.status
                  : "ready",
              editorContents: contents,
              isDirty: contents !== state.activeDocument.savedContents
            }
          }
        : state
    ),
  setActiveDocumentSaving: () =>
    set((state) =>
      state.activeDocument.file
        ? {
            activeDocument: {
              ...state.activeDocument,
              status: "saving",
              error: null
            }
          }
        : state
    ),
  markActiveDocumentSaved: (savedContents) =>
    set((state) =>
      state.activeDocument.file
        ? {
            activeDocument: {
              ...state.activeDocument,
              status: "ready",
              savedContents,
              isDirty: state.activeDocument.editorContents !== savedContents,
              error: null
            }
          }
        : state
    ),
  setActiveDocumentError: (error) =>
    set((state) =>
      state.activeDocument.file
        ? {
            activeDocument: {
              ...state.activeDocument,
              status: "error",
              error
            }
          }
        : state
    ),
  setActivePanel: (panel) => set({ activePanel: panel }),
  startIndexing: (total) =>
    set({ indexing: { status: "indexing", indexed: 0, total, error: null } }),
  setIndexingProgress: (indexed, total) =>
    set({ indexing: { status: "indexing", indexed, total, error: null } }),
  finishIndexing: (indexed) =>
    set({
      indexing: { status: "ready", indexed, total: indexed, error: null }
    }),
  setIndexingError: (error) =>
    set((state) => ({
      indexing: { ...state.indexing, status: "error", error }
    })),
  resetIndexAndSearch: () =>
    set({ indexing: idleIndexingState, search: idleSearchState }),
  setSearchQuery: (query) =>
    set((state) => {
      const isEmpty = query.trim().length === 0;

      return {
        search: {
          query,
          status: isEmpty ? "idle" : state.search.status,
          results: isEmpty ? [] : state.search.results,
          error: isEmpty ? null : state.search.error
        }
      };
    }),
  setSearchPending: () =>
    set((state) => ({
      search: { ...state.search, status: "searching", error: null }
    })),
  setSearchResults: (query, results) =>
    set((state) =>
      // Ignore responses for a query the user has already changed away from.
      state.search.query === query
        ? {
            search: { ...state.search, status: "ready", results, error: null }
          }
        : state
    ),
  setSearchError: (query, error) =>
    set((state) =>
      state.search.query === query
        ? {
            search: { ...state.search, status: "error", results: [], error }
          }
        : state
    )
}));
