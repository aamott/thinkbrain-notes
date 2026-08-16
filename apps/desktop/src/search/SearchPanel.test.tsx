import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchPanel } from "./SearchPanel";
import type { SearchIndexStatus } from "./searchIndexStore";

// ---------------------------------------------------------------------------
// Mock the search index store.
//
// `renderToStaticMarkup` does not run effects and Zustand v5's
// `useSyncExternalStore` pins its snapshot at the first server render, so
// `setState` is not reflected on later renders. Instead we back the hook with a
// plain mutable object read fresh on every call, letting each test set the
// status it wants before rendering.
// ---------------------------------------------------------------------------
const mockStoreState = vi.hoisted(() => ({
  status: { kind: "no-workspace" } as SearchIndexStatus,
  rootPath: null as string | null
}));

vi.mock("./searchIndexStore", () => ({
  useSearchIndexStore: <T,>(selector: (s: typeof mockStoreState) => T): T =>
    selector(mockStoreState)
}));

describe("SearchPanel rendering", () => {
  // Reset the mocked store state to the default no-workspace state between
  // tests so one test's status never leaks into another.
  beforeEach(() => {
    mockStoreState.status = { kind: "no-workspace" };
    mockStoreState.rootPath = null;
  });

  afterEach(() => {
    mockStoreState.status = { kind: "no-workspace" };
    mockStoreState.rootPath = null;
  });

  it("shows a no-workspace prompt when no root path is supplied", () => {
    const markup = renderToStaticMarkup(
      <SearchPanel rootPath={null} onOpenFile={() => undefined} />
    );
    expect(markup).toContain("Open a workspace to search its notes.");
  });

  // renderToStaticMarkup does not run effects, so the store's initial
  // `no-workspace` state renders regardless of the rootPath prop.
  it("renders the no-workspace prompt under static markup regardless of rootPath", () => {
    const markup = renderToStaticMarkup(
      <SearchPanel rootPath="/vault" onOpenFile={() => undefined} />
    );
    expect(markup).toContain("Open a workspace to search its notes.");
  });

  it("renders the indexing message when the store status is indexing", () => {
    mockStoreState.status = { kind: "indexing", progress: null };
    mockStoreState.rootPath = "/vault";
    const markup = renderToStaticMarkup(
      <SearchPanel rootPath="/vault" onOpenFile={() => undefined} />
    );
    expect(markup).toContain("Indexing workspace…");
  });

  it("renders indexing progress counts when available", () => {
    mockStoreState.status = { kind: "indexing", progress: { indexed: 120, total: 350 } };
    mockStoreState.rootPath = "/vault";
    const markup = renderToStaticMarkup(
      <SearchPanel rootPath="/vault" onOpenFile={() => undefined} />
    );
    expect(markup).toContain("Indexing workspace… 120/350");
  });

  it("renders the search input when the index is ready", () => {
    mockStoreState.status = { kind: "ready" };
    mockStoreState.rootPath = "/vault";
    const markup = renderToStaticMarkup(
      <SearchPanel rootPath="/vault" onOpenFile={() => undefined} />
    );
    expect(markup).toContain('aria-label="Search query"');
    expect(markup).toContain("Type a query to search across the workspace.");
  });

  it("renders the error message when the store status is error", () => {
    mockStoreState.status = { kind: "error", message: "The index exploded." };
    mockStoreState.rootPath = "/vault";
    const markup = renderToStaticMarkup(
      <SearchPanel rootPath="/vault" onOpenFile={() => undefined} />
    );
    expect(markup).toContain("Search unavailable");
    expect(markup).toContain("The index exploded.");
  });
});
