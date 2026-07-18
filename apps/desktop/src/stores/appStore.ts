import { create } from "zustand";
import {
  DEFAULT_APP_SETTINGS,
  type Tab,
  type AppSettings,
  type MarkdownFileEntry,
  type ParseSettingsResult,
  type SettingsDiagnostic,
  type WorkspaceDescriptor,
  type WorkspaceEntry
} from "@thinkbrain/core";

import type { NativeCommandErrorShape, ShellStatus } from "../native/commands";
import type { SearchResult } from "../search/searchService";
import {
  emptyTabState,
  tabReducer,
  type TabState
} from "../tabs/tabReducer";

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
      // Markdown-only list used by the indexer and editor.
      readonly files: readonly MarkdownFileEntry[];
      // Full file-manager listing (folders + all file types) for the explorer.
      readonly entries: readonly WorkspaceEntry[];
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
export type ActivePanel = "explorer" | "search" | "settings";

export type SettingsStatus = "idle" | "loading" | "ready" | "saving" | "error";

export interface SettingsState {
  readonly status: SettingsStatus;
  readonly settings: AppSettings;
  readonly draft: AppSettings;
  readonly diagnostics: readonly SettingsDiagnostic[];
  readonly error: NativeCommandErrorShape | null;
}

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
  /** In-memory only: document buffers are never written to layout preferences. */
  readonly editorDocuments: Readonly<Record<string, ActiveDocumentState>>;
  readonly tabState: TabState;
  readonly activePanel: ActivePanel;
  readonly settings: SettingsState;
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
    files: readonly MarkdownFileEntry[],
    entries: readonly WorkspaceEntry[]
  ) => void;
  readonly setWorkspaceError: (error: NativeCommandErrorShape) => void;
  readonly setWorkspaceFiles: (files: readonly MarkdownFileEntry[]) => void;
  readonly setWorkspaceEntries: (entries: readonly WorkspaceEntry[]) => void;
  readonly openActiveDocument: (file: ActiveDocumentFile) => void;
  readonly activateTab: (tabId: string) => void;
  readonly closeTab: (tabId: string) => void;
  readonly setDocumentLoaded: (tabId: string, contents: string) => void;
  readonly setDocumentError: (
    tabId: string,
    error: NativeCommandErrorShape
  ) => void;
  readonly setDocumentSaving: (tabId: string) => void;
  readonly markDocumentSaved: (tabId: string, savedContents: string) => void;
  readonly setActiveDocumentLoaded: (contents: string) => void;
  readonly updateActiveDocumentContents: (contents: string) => void;
  readonly setActiveDocumentSaving: () => void;
  readonly markActiveDocumentSaved: (savedContents: string) => void;
  readonly setActiveDocumentError: (error: NativeCommandErrorShape) => void;
  readonly setActivePanel: (panel: ActivePanel) => void;
  readonly setSettingsLoading: () => void;
  readonly setSettingsReady: (
    settings: AppSettings,
    diagnostics: readonly SettingsDiagnostic[]
  ) => void;
  readonly updateSettingsDraft: (settings: AppSettings) => void;
  readonly setSettingsSaving: () => void;
  readonly setSettingsSaved: (
    settings: AppSettings,
    diagnostics: readonly SettingsDiagnostic[]
  ) => void;
  readonly setSettingsError: (error: NativeCommandErrorShape) => void;
  readonly loadSettings: (
    loader: () => Promise<ParseSettingsResult>
  ) => Promise<void>;
  readonly saveSettings: (
    saver: (settings: AppSettings) => Promise<ParseSettingsResult>
  ) => Promise<void>;
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

const idleActiveDocument: ActiveDocumentState = {
  status: "idle",
  file: null,
  savedContents: "",
  editorContents: "",
  isDirty: false,
  error: null
};

function createEditorTab(file: ActiveDocumentFile): Tab {
  const id = `editor:${file.rootPath}:${file.relativePath}`;

  return {
    id,
    title: file.fileName,
    kind: "editor",
    resource: { rootPath: file.rootPath, relativePath: file.relativePath }
  };
}

function getActiveDocumentForTab(
  tabState: TabState,
  editorDocuments: Readonly<Record<string, ActiveDocumentState>>
): ActiveDocumentState {
  const activeTab = tabState.tabs.find((tab) => tab.id === tabState.activeTabId);

  return activeTab?.kind === "editor"
    ? editorDocuments[activeTab.id] ?? idleActiveDocument
    : idleActiveDocument;
}

function replaceActiveEditorDocument(
  state: Pick<AppStoreState, "activeDocument" | "editorDocuments" | "tabState">,
  document: ActiveDocumentState
) {
  const activeTabId = state.tabState.activeTabId;
  const activeTab = state.tabState.tabs.find((tab) => tab.id === activeTabId);

  if (!activeTabId || activeTab?.kind !== "editor") {
    return state;
  }

  return {
    activeDocument: document,
    editorDocuments: { ...state.editorDocuments, [activeTabId]: document },
    tabState: tabReducer(state.tabState, {
      type: "set-dirty",
      tabId: activeTabId,
      isDirty: document.isDirty
    })
  };
}

function replaceEditorDocument(
  state: Pick<AppStoreState, "activeDocument" | "editorDocuments" | "tabState">,
  tabId: string,
  document: ActiveDocumentState
) {
  const tab = state.tabState.tabs.find((candidate) => candidate.id === tabId);

  if (tab?.kind !== "editor") {
    return state;
  }

  return {
    activeDocument:
      state.tabState.activeTabId === tabId ? document : state.activeDocument,
    editorDocuments: { ...state.editorDocuments, [tabId]: document },
    tabState: tabReducer(state.tabState, {
      type: "set-dirty",
      tabId,
      isDirty: document.isDirty
    })
  };
}

function omitEditorDocument(
  documents: Readonly<Record<string, ActiveDocumentState>>,
  tabId: string
): Readonly<Record<string, ActiveDocumentState>> {
  const remaining = { ...documents };
  delete remaining[tabId];

  return remaining;
}

const idleSearchState: SearchState = {
  query: "",
  status: "idle",
  results: [],
  error: null
};

const idleSettingsState: SettingsState = {
  status: "idle",
  settings: DEFAULT_APP_SETTINGS,
  draft: DEFAULT_APP_SETTINGS,
  diagnostics: [],
  error: null
};

export const useAppStore = create<AppStoreState>((set) => ({
  bootChecks: 0,
  nativeShell: { status: "idle" },
  workspace: { status: "idle" },
  activeDocument: {
    ...idleActiveDocument
  },
  editorDocuments: {},
  tabState: emptyTabState,
  activePanel: "explorer",
  settings: idleSettingsState,
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
  setWorkspaceReady: (workspace, files, entries) =>
    set({ workspace: { status: "ready", workspace, files, entries } }),
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
  setWorkspaceEntries: (entries) =>
    set((state) =>
      state.workspace.status === "ready"
        ? {
            workspace: {
              ...state.workspace,
              entries
            }
          }
        : state
    ),
  openActiveDocument: (file) =>
    set((state) => {
      const tab = createEditorTab(file);
      const tabState = tabReducer(state.tabState, { type: "open", tab });
      const existingDocument = state.editorDocuments[tab.id];

      if (existingDocument) {
        return { tabState, activeDocument: existingDocument };
      }

      const activeDocument: ActiveDocumentState = {
        status: "loading",
        file,
        savedContents: "",
        editorContents: "",
        isDirty: false,
        error: null
      };

      return {
        tabState,
        activeDocument,
        editorDocuments: { ...state.editorDocuments, [tab.id]: activeDocument }
      };
    }),
  activateTab: (tabId) =>
    set((state) => {
      const tabState = tabReducer(state.tabState, { type: "activate", tabId });

      return {
        tabState,
        activeDocument: getActiveDocumentForTab(tabState, state.editorDocuments)
      };
    }),
  closeTab: (tabId) =>
    set((state) => {
      const tabState = tabReducer(state.tabState, { type: "close", tabId });
      const editorDocuments = omitEditorDocument(state.editorDocuments, tabId);

      return {
        tabState,
        editorDocuments,
        activeDocument: getActiveDocumentForTab(tabState, editorDocuments)
      };
    }),
  setDocumentLoaded: (tabId, contents) =>
    set((state) => {
      const document = state.editorDocuments[tabId];

      return document?.file
        ? replaceEditorDocument(state, tabId, {
            ...document,
            status: "ready",
            savedContents: contents,
            editorContents: contents,
            isDirty: false,
            error: null
          })
        : state;
    }),
  setDocumentError: (tabId, error) =>
    set((state) => {
      const document = state.editorDocuments[tabId];

      return document?.file
        ? replaceEditorDocument(state, tabId, {
            ...document,
            status: "error",
            error
          })
        : state;
    }),
  setDocumentSaving: (tabId) =>
    set((state) => {
      const document = state.editorDocuments[tabId];

      return document?.file
        ? replaceEditorDocument(state, tabId, {
            ...document,
            status: "saving",
            error: null
          })
        : state;
    }),
  markDocumentSaved: (tabId, savedContents) =>
    set((state) => {
      const document = state.editorDocuments[tabId];

      return document?.file
        ? replaceEditorDocument(state, tabId, {
            ...document,
            status: "ready",
            savedContents,
            isDirty: document.editorContents !== savedContents,
            error: null
          })
        : state;
    }),
  setActiveDocumentLoaded: (contents) =>
    set((state) =>
      state.activeDocument.file
        ? replaceActiveEditorDocument(state, {
              ...state.activeDocument,
              status: "ready",
              savedContents: contents,
              editorContents: contents,
              isDirty: false,
              error: null
            })
        : state
    ),
  updateActiveDocumentContents: (contents) =>
    set((state) =>
      state.activeDocument.file
        ? replaceActiveEditorDocument(state, {
              ...state.activeDocument,
              status:
                state.activeDocument.status === "loading" ||
                state.activeDocument.status === "saving"
                  ? state.activeDocument.status
                  : "ready",
              editorContents: contents,
              isDirty: contents !== state.activeDocument.savedContents
            })
        : state
    ),
  setActiveDocumentSaving: () =>
    set((state) =>
      state.activeDocument.file
        ? replaceActiveEditorDocument(state, {
              ...state.activeDocument,
              status: "saving",
              error: null
            })
        : state
    ),
  markActiveDocumentSaved: (savedContents) =>
    set((state) =>
      state.activeDocument.file
        ? replaceActiveEditorDocument(state, {
              ...state.activeDocument,
              status: "ready",
              savedContents,
              isDirty: state.activeDocument.editorContents !== savedContents,
              error: null
            })
        : state
    ),
  setActiveDocumentError: (error) =>
    set((state) =>
      state.activeDocument.file
        ? replaceActiveEditorDocument(state, {
              ...state.activeDocument,
              status: "error",
              error
            })
        : state
    ),
  setActivePanel: (panel) => set({ activePanel: panel }),
  setSettingsLoading: () =>
    set((state) => ({
      settings: { ...state.settings, status: "loading", error: null }
    })),
  setSettingsReady: (settings, diagnostics) =>
    set({
      settings: {
        status: "ready",
        settings,
        draft: settings,
        diagnostics,
        error: null
      }
    }),
  updateSettingsDraft: (settings) =>
    set((state) => ({
      settings: {
        ...state.settings,
        draft: settings,
        error: null
      }
    })),
  setSettingsSaving: () =>
    set((state) => ({
      settings: { ...state.settings, status: "saving", error: null }
    })),
  setSettingsSaved: (settings, diagnostics) =>
    set({
      settings: {
        status: "ready",
        settings,
        draft: settings,
        diagnostics,
        error: null
      }
    }),
  setSettingsError: (error) =>
    set((state) => ({
      settings: { ...state.settings, status: "error", error }
    })),
  loadSettings: async (loader) => {
    set((state) => ({
      settings: { ...state.settings, status: "loading", error: null }
    }));

    try {
      const result = await loader();
      set({
        settings: {
          status: "ready",
          settings: result.settings,
          draft: result.settings,
          diagnostics: result.diagnostics,
          error: null
        }
      });
    } catch (error) {
      set((state) => ({
        settings: {
          ...state.settings,
          status: "error",
          error: toNativeCommandErrorShape(error)
        }
      }));
    }
  },
  saveSettings: async (saver) => {
    set((state) => ({
      settings: { ...state.settings, status: "saving", error: null }
    }));

    try {
      const result = await saver(useAppStore.getState().settings.draft);
      set({
        settings: {
          status: "ready",
          settings: result.settings,
          draft: result.settings,
          diagnostics: result.diagnostics,
          error: null
        }
      });
    } catch (error) {
      set((state) => ({
        settings: {
          ...state.settings,
          status: "error",
          error: toNativeCommandErrorShape(error)
        }
      }));
    }
  },
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

function toNativeCommandErrorShape(error: unknown): NativeCommandErrorShape {
  if (isNativeCommandErrorShape(error)) {
    return error;
  }

  if (error instanceof Error) {
    return {
      code: "settings.operation_failed",
      message: error.message
    };
  }

  return {
    code: "settings.operation_failed",
    message: "Settings operation failed."
  };
}

function isNativeCommandErrorShape(error: unknown): error is NativeCommandErrorShape {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as Record<string, unknown>;

  return (
    typeof candidate.code === "string" &&
    typeof candidate.message === "string" &&
    (candidate.details === undefined || typeof candidate.details === "string")
  );
}
