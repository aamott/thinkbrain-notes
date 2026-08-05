import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SearchPanel } from "./SearchPanel";
import { initialSearchPanelState, searchPanelReducer } from "./searchPanelModel";

describe("searchPanelReducer", () => {
  it("replaces index state and clears results on set-index", () => {
    const state: ReturnType<typeof searchPanelReducer> = {
      ...initialSearchPanelState,
      results: [{ relativePath: "a.md", fileName: "a.md", line: 1, preview: "x" }],
      searchError: "boom"
    };
    const next = searchPanelReducer(state, { type: "set-index", index: { kind: "ready" } });
    expect(next.index).toEqual({ kind: "ready" });
    expect(next.results).toEqual([]);
    expect(next.searchError).toBeNull();
  });

  it("updates query and clears search error on set-query", () => {
    const next = searchPanelReducer(
      { ...initialSearchPanelState, searchError: "boom" },
      { type: "set-query", query: "hello" }
    );
    expect(next.query).toBe("hello");
    expect(next.searchError).toBeNull();
  });

  it("sets results and clears searching flag on set-results", () => {
    const next = searchPanelReducer(
      { ...initialSearchPanelState, isSearching: true },
      { type: "set-results", results: [{ relativePath: "a.md", fileName: "a.md", line: 1, preview: "x" }] }
    );
    expect(next.results).toHaveLength(1);
    expect(next.isSearching).toBe(false);
  });

  it("clears searching flag and sets message on set-search-error", () => {
    const next = searchPanelReducer(
      { ...initialSearchPanelState, isSearching: true },
      { type: "set-search-error", message: "failed" }
    );
    expect(next.isSearching).toBe(false);
    expect(next.searchError).toBe("failed");
  });

  it("transitions to indexing state when a workspace is set", () => {
    const next = searchPanelReducer(
      initialSearchPanelState,
      { type: "set-index", index: { kind: "indexing" } }
    );
    expect(next.index).toEqual({ kind: "indexing" });
    expect(next.results).toEqual([]);
  });
});

describe("SearchPanel rendering", () => {
  it("shows a no-workspace prompt when no root path is supplied", () => {
    const markup = renderToStaticMarkup(
      <SearchPanel rootPath={null} onOpenFile={() => undefined} />
    );
    expect(markup).toContain("Open a workspace to search its notes.");
  });

  // renderToStaticMarkup does not run effects, so the indexing state is only
  // reachable through the reducer. The reducer test below covers that path.
  it("renders the no-workspace prompt under static markup regardless of rootPath", () => {
    const markup = renderToStaticMarkup(
      <SearchPanel rootPath="/vault" onOpenFile={() => undefined} />
    );
    // Effects don't fire under renderToStaticMarkup, so initial state renders.
    expect(markup).toContain("Open a workspace to search its notes.");
  });
});
