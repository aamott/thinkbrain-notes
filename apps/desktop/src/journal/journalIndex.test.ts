import { describe, expect, it, vi } from "vitest";

import {
  JOURNAL_SEARCH_LIMIT,
  journalFacetValues,
  journalMetadataMatches,
  searchJournalEntries
} from "./journalIndex";

describe("journal search", () => {
  /**
   * The panel filters its rows by the paths this returns, so a hit that the
   * index left out is an entry the user is told does not match. Scoping the
   * query is what keeps the limit counting journal entries instead of whatever
   * the rest of the vault ranked above them.
   */
  it("asks the index only about the journal folder", async () => {
    const search = vi.fn(async () => [
      {
        relativePath: "journal/2026-08-13.md",
        fileName: "2026-08-13.md",
        title: null,
        snippet: "…standup…",
        score: -1
      }
    ]);

    await expect(searchJournalEntries(search, "/vault", "journal", "standup")).resolves.toEqual(
      new Set(["journal/2026-08-13.md"])
    );
    expect(search).toHaveBeenCalledWith("/vault", "standup", {
      pathPrefix: "journal",
      limit: JOURNAL_SEARCH_LIMIT
    });
  });

  it("matches nothing while there is no index to ask", async () => {
    const search = vi.fn();

    await expect(searchJournalEntries(search, null, "journal", "standup")).resolves.toEqual(
      new Set()
    );
    expect(search).not.toHaveBeenCalled();
  });
});

describe("journal metadata filters", () => {
  const definitions = [
    { id: "mood", label: "Mood", type: "single-select" as const },
    { id: "rating", label: "Rating", type: "number" as const }
  ];

  const available = (facets: readonly { key: string; values: readonly string[] }[]) =>
    vi.fn(async () => ({ kind: "available" as const, facets, matchingPaths: [] }));

  it("asks the whole folder for its values, so a choice never hides the alternatives", async () => {
    const queryMetadata = available([{ key: "mood", values: ["good", "tired"] }]);

    const facets = await journalFacetValues(queryMetadata, "/vault", "journal", definitions);

    expect(queryMetadata).toHaveBeenCalledWith("/vault", {
      pathPrefix: "journal",
      facetKeys: ["mood", "rating"],
      // Deliberately unfiltered: the index computes facet values over what a
      // query matched, so predicates here would drop the values not yet chosen.
      predicates: []
    });
    expect(facets).toEqual([{ key: "mood", label: "Mood", values: ["good", "tired"] }]);
  });

  it("labels a field the user stopped configuring with its frontmatter key (D45)", async () => {
    const queryMetadata = available([{ key: "weather", values: ["rain"] }]);

    const facets = await journalFacetValues(queryMetadata, "/vault", "journal", definitions);

    expect(facets).toEqual([{ key: "weather", label: "weather", values: ["rain"] }]);
  });

  it("offers nothing rather than guessing when the index cannot answer", async () => {
    const queryMetadata = vi.fn(async () => ({
      kind: "unavailable" as const,
      reason: "indexing" as const
    }));

    await expect(
      journalFacetValues(queryMetadata, "/vault", "journal", definitions)
    ).resolves.toEqual([]);
  });

  it("does not ask at all when no fields are configured", async () => {
    const queryMetadata = available([]);

    await expect(journalFacetValues(queryMetadata, "/vault", "journal", [])).resolves.toEqual([]);
    expect(queryMetadata).not.toHaveBeenCalled();
  });

  it("asks for matching paths without paying for facet values it already has", async () => {
    const queryMetadata = vi.fn(async () => ({
      kind: "available" as const,
      facets: [],
      matchingPaths: ["journal/2026-08-13.md"]
    }));

    const paths = await journalMetadataMatches(queryMetadata, "/vault", "journal", [
      { key: "mood", value: "good" }
    ]);

    expect(queryMetadata).toHaveBeenCalledWith("/vault", {
      pathPrefix: "journal",
      facetKeys: [],
      predicates: [{ key: "mood", value: "good" }]
    });
    expect(paths).toEqual(new Set(["journal/2026-08-13.md"]));
  });

  it("matches nothing while there is no index to ask", async () => {
    const queryMetadata = vi.fn();

    await expect(
      journalMetadataMatches(queryMetadata, null, "journal", [{ key: "mood", value: "good" }])
    ).resolves.toEqual(new Set());
    expect(queryMetadata).not.toHaveBeenCalled();
  });
});
