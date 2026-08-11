/** A single search hit rendered in the results list. */
export interface SearchHit {
  readonly relativePath: string;
  readonly fileName: string;
  readonly title: string | null;
  readonly snippet: string;
  readonly score: number;
}

/** Lifecycle states for the search index. */
export type SearchIndexState =
  | { readonly kind: "no-workspace" }
  | { readonly kind: "indexing" }
  | { readonly kind: "ready" }
  | { readonly kind: "error"; readonly message: string };

/** State managed by the search panel reducer. */
export interface SearchPanelState {
  readonly index: SearchIndexState;
  readonly query: string;
  readonly results: readonly SearchHit[];
  readonly isSearching: boolean;
  readonly searchError: string | null;
}

/** Actions dispatched into the search panel reducer. */
export type SearchPanelAction =
  | { readonly type: "set-index"; readonly index: SearchIndexState }
  | { readonly type: "set-query"; readonly query: string }
  | { readonly type: "set-results"; readonly results: readonly SearchHit[] }
  | { readonly type: "set-searching"; readonly isSearching: boolean }
  | { readonly type: "set-search-error"; readonly message: string | null };

/** Initial state before any workspace or query is known. */
export const initialSearchPanelState: SearchPanelState = {
  index: { kind: "no-workspace" },
  query: "",
  results: [],
  isSearching: false,
  searchError: null
};

/**
 * Pure reducer for search panel state transitions.
 *
 * Kept separate from the component so it can be unit-tested in isolation and
 * reused when a real search service is plugged in.
 */
export function searchPanelReducer(
  state: SearchPanelState,
  action: SearchPanelAction
): SearchPanelState {
  switch (action.type) {
    case "set-index":
      return { ...state, index: action.index, results: [], searchError: null };
    case "set-query":
      return { ...state, query: action.query, searchError: null };
    case "set-results":
      return { ...state, results: action.results, isSearching: false, searchError: null };
    case "set-searching":
      return { ...state, isSearching: action.isSearching };
    case "set-search-error":
      return { ...state, searchError: action.message, isSearching: false };
  }
}
