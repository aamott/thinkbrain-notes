import { useEffect } from "react";

import { normalizeNativeError } from "../native/commands";
import {
  type IndexingState,
  type SearchState,
  useAppStore
} from "../stores/appStore";
import { openNoteDocument } from "../workspace/openNote";
import { searchWorkspace, type SearchResult } from "./searchService";

// Debounce keystrokes so type-ahead search does not fire a native query per key.
const SEARCH_DEBOUNCE_MS = 160;

export function SearchPanel() {
  const workspace = useAppStore((state) => state.workspace);
  const search = useAppStore((state) => state.search);
  const indexing = useAppStore((state) => state.indexing);
  const setSearchQuery = useAppStore((state) => state.setSearchQuery);
  const setSearchPending = useAppStore((state) => state.setSearchPending);
  const setSearchResults = useAppStore((state) => state.setSearchResults);
  const setSearchError = useAppStore((state) => state.setSearchError);

  const rootPath =
    workspace.status === "ready" ? workspace.workspace.rootPath : null;
  const query = search.query;
  const trimmedQuery = query.trim();

  useEffect(() => {
    if (!rootPath || trimmedQuery.length === 0) {
      return;
    }

    let cancelled = false;
    setSearchPending();

    const handle = setTimeout(() => {
      searchWorkspace(rootPath, trimmedQuery)
        .then((results) => {
          if (!cancelled) {
            setSearchResults(query, results);
          }
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            setSearchError(query, normalizeNativeError(error));
          }
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [
    rootPath,
    query,
    trimmedQuery,
    setSearchPending,
    setSearchResults,
    setSearchError
  ]);

  return (
    <aside className="search-panel" aria-labelledby="search-title">
      <div className="search-panel__header">
        <p className="app-eyebrow">Search</p>
        <h2 id="search-title">Find notes</h2>
      </div>

      <input
        aria-label="Search notes"
        className="search-panel__input"
        disabled={!rootPath}
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder="Search names, text, tags, aliases…"
        type="search"
        value={query}
      />

      <IndexingStatus indexing={indexing} />

      <SearchResultsBody
        hasWorkspace={Boolean(rootPath)}
        rootPath={rootPath}
        search={search}
        trimmedQuery={trimmedQuery}
      />
    </aside>
  );
}

function IndexingStatus({ indexing }: { readonly indexing: IndexingState }) {
  if (indexing.status === "indexing") {
    return (
      <p className="search-panel__indexing" role="status">
        Indexing notes… {indexing.indexed}/{indexing.total}
      </p>
    );
  }

  if (indexing.status === "error" && indexing.error) {
    return (
      <p className="search-panel__indexing search-panel__indexing--error" role="status">
        Indexing failed ({indexing.error.code}): {indexing.error.message}
      </p>
    );
  }

  if (indexing.status === "ready") {
    return (
      <p className="search-panel__indexing" role="status">
        Indexed {indexing.indexed} {indexing.indexed === 1 ? "note" : "notes"}.
      </p>
    );
  }

  return null;
}

function SearchResultsBody({
  hasWorkspace,
  rootPath,
  search,
  trimmedQuery
}: {
  readonly hasWorkspace: boolean;
  readonly rootPath: string | null;
  readonly search: SearchState;
  readonly trimmedQuery: string;
}) {
  const activeDocument = useAppStore((state) => state.activeDocument);

  if (!hasWorkspace) {
    return (
      <p className="search-empty">Open a folder to search your notes.</p>
    );
  }

  if (trimmedQuery.length === 0) {
    return (
      <p className="search-empty">
        Type to search across filenames, Markdown text, tags, and aliases.
      </p>
    );
  }

  if (search.status === "error" && search.error) {
    return (
      <div className="workspace-error" role="status">
        <strong>{search.error.code}</strong>
        <span>{search.error.message}</span>
      </div>
    );
  }

  if (search.status === "searching") {
    return <p className="search-empty">Searching…</p>;
  }

  if (search.status === "ready" && search.results.length === 0) {
    return (
      <p className="search-empty">No notes match “{trimmedQuery}”.</p>
    );
  }

  function handleOpen(result: SearchResult) {
    if (!rootPath) {
      return;
    }

    void openNoteDocument({
      rootPath,
      relativePath: result.path,
      fileName: result.fileName
    });
  }

  return (
    <ul className="search-results" aria-label="Search results">
      {search.results.map((result) => (
        <li key={result.path} className="search-results__item">
          <button
            aria-current={
              activeDocument.file?.rootPath === rootPath &&
              activeDocument.file.relativePath === result.path
                ? "page"
                : undefined
            }
            className="search-results__hit"
            onClick={() => handleOpen(result)}
            type="button"
          >
            <span className="search-results__name">
              {result.title ?? result.fileName}
            </span>
            <small className="search-results__path">{result.path}</small>
            {result.snippet ? (
              <span className="search-results__snippet">{result.snippet}</span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}
