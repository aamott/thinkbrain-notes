import { useEffect, useRef, useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { Unavailable } from "../shell/Unavailable";
import { cn } from "../lib/utils";
import { searchService, type SearchResult } from "./searchService";
import { useSearchIndexStore } from "./searchIndexStore";

/** Module-scoped search service singleton backing the panel. */

/** Debounce delay (ms) before firing a search after the query stops changing. */
const SEARCH_DEBOUNCE_MS = 300;

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
 * Reads index lifecycle state from {@link useSearchIndexStore} and renders a
 * debounced type-ahead search input once the index is `ready`. Searches are
 * debounced (300ms) and guarded against stale results via an incrementing
 * request id so a slow earlier query cannot overwrite a fresher one.
 */
export function SearchPanel({ rootPath, onOpenFile }: SearchPanelProps) {
  const status = useSearchIndexStore((s) => s.status);

  // UI-specific state kept local: the query, results, and search load/error.
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Debounce timer + monotonic request id for stale-result suppression.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  // Debounced search: re-runs when the query or index readiness changes.
  // All setState calls happen inside the setTimeout callback to avoid the
  // cascading-render anti-pattern of synchronous setState in effect bodies.
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (status.kind !== "ready" || !rootPath) {
      return;
    }

    const trimmed = query.trim();
    const requestId = ++requestIdRef.current;
    const delay = trimmed === "" ? 0 : SEARCH_DEBOUNCE_MS;

    debounceRef.current = setTimeout(async () => {
      // Ignore stale callbacks from a superseded query or workspace switch.
      if (requestId !== requestIdRef.current) return;

      if (trimmed === "") {
        setResults([]);
        setSearchError(null);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      setSearchError(null);
      try {
        const hits = await searchService.search(rootPath, trimmed);
        if (requestId !== requestIdRef.current) return;
        setResults(hits);
      } catch (error) {
        if (requestId !== requestIdRef.current) return;
        const message = error instanceof Error ? error.message : String(error);
        setSearchError(message);
      } finally {
        if (requestId === requestIdRef.current) {
          setIsSearching(false);
        }
      }
    }, delay);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [query, status.kind, rootPath]);

  const handleResultClick = (relativePath: string) => {
    onOpenFile(relativePath);
  };

  if (status.kind === "no-workspace") {
    return (
      <Unavailable title="Search" description="Open a workspace to search its notes." />
    );
  }

  if (status.kind === "indexing") {
    const description = status.progress
      ? `Indexing workspace… ${status.progress.indexed}/${status.progress.total}`
      : "Indexing workspace…";
    return <Unavailable title="Search" description={description} />;
  }

  if (status.kind === "error") {
    return <Unavailable title="Search unavailable" description={status.message} />;
  }

  return (
    <section aria-label="Search" className="flex flex-1 flex-col min-h-0 text-[.8rem]">
      <form
        onSubmit={(event: FormEvent<HTMLFormElement>) => event.preventDefault()}
        className="flex items-center gap-2 px-3 py-2 border-b border-border"
      >
        <Search className="size-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search workspace…"
          aria-label="Search query"
          className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
        />
        {isSearching && (
          <span className="text-muted-foreground text-xs shrink-0" aria-hidden="true">
            …
          </span>
        )}
      </form>

      {searchError && (
        <p role="alert" className="px-3 py-2 text-muted-foreground text-xs">
          {searchError}
        </p>
      )}

      <div className="flex-1 overflow-y-auto px-3 pb-2">
        {results.length === 0 ? (
          <p className="text-muted-foreground text-xs py-4 text-center">
            {query
              ? "No matches found."
              : "Type a query to search across the workspace."}
          </p>
        ) : (
          <ul className="flex flex-col gap-2 list-none p-0 m-0">
            {results.map((hit) => (
              <li key={hit.relativePath}>
                <button
                  type="button"
                  onClick={() => handleResultClick(hit.relativePath)}
                  className={cn(
                    "w-full text-left rounded px-1 py-1 hover:bg-accent/60 cursor-pointer"
                  )}
                >
                  <div className="flex items-center gap-1.5 text-[13px] font-medium">
                    <span className="truncate">{hit.fileName}</span>
                    {hit.title && (
                      <span className="truncate text-muted-foreground">{hit.title}</span>
                    )}
                  </div>
                  <div className="mt-0.5 pl-5 text-[12px] text-muted-foreground truncate">
                    {hit.snippet}
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
