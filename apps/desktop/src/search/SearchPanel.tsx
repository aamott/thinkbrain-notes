import { useCallback, useEffect, useReducer, type FormEvent } from "react";
import { Search } from "lucide-react";
import { Unavailable } from "../shell/Unavailable";
import { cn } from "../lib/utils";
import {
  initialSearchPanelState,
  searchPanelReducer,
  type SearchHit
} from "./searchPanelModel";

/** Props for the search panel. */
export interface SearchPanelProps {
  /** Workspace root path, or `null` when no workspace is open. */
  readonly rootPath: string | null;
  /** Called when a user activates a search result. */
  readonly onOpenFile: (relativePath: string) => void;
}

/**
 * Workspace search panel.
 *
 * Renders a search input and results list. Until a search index service is
 * implemented the panel reports an indexing-unavailable state rather than
 * fabricating results, but the state machine and `onOpenFile` wiring are ready
 * for a real backend to plug in.
 */
export function SearchPanel({ rootPath, onOpenFile }: SearchPanelProps) {
  const [state, dispatch] = useReducer(searchPanelReducer, initialSearchPanelState);

  // Track the workspace root so the index state reflects the current workspace.
  useEffect(() => {
    if (!rootPath) {
      dispatch({ type: "set-index", index: { kind: "no-workspace" } });
      return;
    }
    // A real search service would begin indexing here. Until then we surface
    // an explicit "indexing unavailable" state so users know why search is
    // empty rather than guessing.
    dispatch({ type: "set-index", index: { kind: "indexing" } });
  }, [rootPath]);

  const handleSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // No search backend yet — keep the wiring in place without fabricating
    // results. When a service is added it will be invoked here.
    dispatch({ type: "set-searching", isSearching: false });
  }, []);

  const handleResultClick = useCallback((relativePath: string) => {
    onOpenFile(relativePath);
  }, [onOpenFile]);

  if (state.index.kind === "no-workspace") {
    return (
      <Unavailable
        title="Search"
        description="Open a workspace to search its notes."
      />
    );
  }

  if (state.index.kind === "indexing") {
    return (
      <Unavailable
        title="Search"
        description="Search indexing is not yet available. A future epic will connect the workspace search backend."
      />
    );
  }

  if (state.index.kind === "error") {
    return (
      <Unavailable
        title="Search unavailable"
        description={state.index.message}
      />
    );
  }

  return (
    <section aria-label="Search" className="flex flex-1 flex-col min-h-0 text-[.8rem]">
      <form onSubmit={handleSubmit} className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Search className="size-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
        <input
          type="search"
          value={state.query}
          onChange={(event) => dispatch({ type: "set-query", query: event.target.value })}
          placeholder="Search workspace…"
          aria-label="Search query"
          className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
        />
      </form>

      {state.searchError && (
        <p role="alert" className="px-3 py-2 text-muted-foreground text-xs">
          {state.searchError}
        </p>
      )}

      <div className="flex-1 overflow-y-auto px-3 pb-2">
        {state.results.length === 0 ? (
          <p className="text-muted-foreground text-xs py-4 text-center">
            {state.query
              ? "No matches found."
              : "Type a query to search across the workspace."}
          </p>
        ) : (
          <ul className="flex flex-col gap-2 list-none p-0 m-0">
            {state.results.map((hit: SearchHit) => (
              <li key={`${hit.relativePath}:${hit.line}`}>
                <button
                  type="button"
                  onClick={() => handleResultClick(hit.relativePath)}
                  className={cn(
                    "w-full text-left rounded px-1 py-1 hover:bg-accent/60 cursor-pointer"
                  )}
                >
                  <div className="flex items-center gap-1.5 text-[13px] font-medium">
                    <span className="truncate">{hit.fileName}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">:{hit.line}</span>
                  </div>
                  <div className="mt-0.5 pl-5 text-[12px] text-muted-foreground truncate">
                    {hit.preview}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
