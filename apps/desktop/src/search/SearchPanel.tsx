import { useEffect, useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { getErrorMessage } from "@thinkbrain/core";
import { Unavailable } from "../shell/Unavailable";
import { cn } from "../lib/utils";
import { searchService, type SearchResult } from "./searchService";
import { useSearchIndexStore } from "./searchIndexStore";
import { createDebounced } from "../lib/debounce";

/** Module-scoped search service singleton backing the panel. */

/** Debounce delay (ms) before firing a search after the query stops changing. */
const SEARCH_DEBOUNCE_MS = 300;

/** One scheduled search: the request it answers for, where, and what for. */
interface SearchCall {
  readonly requestId: number;
  readonly root: string;
  readonly trimmed: string;
}

// Monotonic request id for stale-result suppression. Module-scope: ids only
// need to be unique and increasing, not per panel instance.
let requestSeq = 0;

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

  const [debouncedSearch] = useState(() =>
    createDebounced(async ({ requestId, root, trimmed }: SearchCall) => {
      setIsSearching(true);
      setSearchError(null);
      try {
        const hits = await searchService.search(root, trimmed);
        if (requestId !== requestSeq) return;
        setResults(hits);
      } catch (error) {
        if (requestId !== requestSeq) return;
        const message = getErrorMessage(error);
        setSearchError(message);
      } finally {
        if (requestId === requestSeq) {
          setIsSearching(false);
        }
      }
    }, SEARCH_DEBOUNCE_MS)
  );

  // Debounced search: re-runs when the query or index readiness changes.
  // All setState calls happen inside the scheduled callback to avoid the
  // cascading-render anti-pattern of synchronous setState in effect bodies.
  useEffect(() => {
    debouncedSearch.cancel();

    if (status.kind !== "ready" || !rootPath) {
      return;
    }

    const trimmed = query.trim();
    const requestId = ++requestSeq;
    if (trimmed === "") {
      // An empty box answers on the next tick, not after the debounce delay.
      const timer = setTimeout(() => {
        // Ignore stale callbacks from a superseded query or workspace switch.
        if (requestId !== requestSeq) return;
        setResults([]);
        setSearchError(null);
        setIsSearching(false);
      }, 0);
      return () => clearTimeout(timer);
    }

    debouncedSearch({ requestId, root: rootPath, trimmed });
    return () => debouncedSearch.cancel();
  }, [query, status.kind, rootPath, debouncedSearch]);

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
        className="flex items-center gap-2 px-3 py-2 border-b border-border pointer-coarse:px-4 pointer-coarse:py-3"
      >
        <Search className="size-3.5 text-muted-foreground shrink-0 pointer-coarse:size-4" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search workspace…"
          aria-label="Search query"
          className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground pointer-coarse:min-h-11 pointer-coarse:text-base"
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
                  onClick={() => onOpenFile(hit.relativePath)}
                  className={cn(
                    "w-full text-left rounded px-1 py-1 hover:bg-accent/60 cursor-pointer pointer-coarse:min-h-11 pointer-coarse:px-2 pointer-coarse:py-2"
                  )}
                >
                  <div className="flex items-center gap-1.5 text-[13px] font-medium pointer-coarse:text-sm">
                    <span className="truncate">{hit.fileName}</span>
                    {hit.title && (
                      <span className="truncate text-muted-foreground">{hit.title}</span>
                    )}
                  </div>
                  <div className="mt-0.5 pl-5 text-[12px] text-muted-foreground truncate pointer-coarse:text-[13px]">
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
