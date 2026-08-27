import { describe, expect, it } from "vitest";

import { fuzzyScore, fuzzySearch } from "./fuzzyMatch";

describe("fuzzyScore", () => {
  it("returns zero for empty and non-matching queries", () => {
    expect(fuzzyScore("", "Font size")).toBe(0);
    expect(fuzzyScore("xyz", "Font size")).toBe(0);
  });

  it("matches case-insensitive ordered subsequences", () => {
    expect(fuzzyScore("Fnt", "font size")).toBeGreaterThan(0);
    expect(fuzzyScore("fs", "FontSize")).toBeGreaterThan(0);
  });

  it("ranks exact, prefix, and compact matches above sparse matches", () => {
    const exact = fuzzyScore("font", "font");
    const prefix = fuzzyScore("font", "font size");
    const sparse = fuzzyScore("font", "formatted note");

    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(sparse);
  });

  it("rewards matches near the start of the target", () => {
    expect(fuzzyScore("font", "font family")).toBeGreaterThan(
      fuzzyScore("font", "editor font family")
    );
  });
});

describe("fuzzySearch", () => {
  interface SearchItem {
    readonly id?: string;
    readonly label: string;
    readonly description: string;
    readonly key: string;
  }

  const items: readonly SearchItem[] = [
    { id: "label", label: "Font size", description: "Editor text scale", key: "editor.size" },
    { id: "description", label: "Text scale", description: "Font size", key: "editor.scale" },
    { id: "key", label: "Text dimensions", description: "Editor scale", key: "editor.fontSize" }
  ];
  const fields = [
    { value: (item: SearchItem) => item.label, weight: 3 },
    { value: (item: SearchItem) => item.description, weight: 2 },
    { value: (item: SearchItem) => item.key, weight: 1 }
  ] as const;

  it("matches every configured field and applies field weights", () => {
    expect(fuzzySearch("font", items, fields).map(({ item }) => item.id)).toEqual([
      "label",
      "description",
      "key"
    ]);
  });

  it("allows query tokens to match across different fields", () => {
    const ids = fuzzySearch("editor font", items, fields).map(({ item }) => item.id);

    expect(ids).toHaveLength(3);
    expect(ids).toEqual(expect.arrayContaining(["label", "description", "key"]));
  });

  it("preserves input order when scores tie", () => {
    const tied = [
      { label: "Alpha", description: "", key: "first" },
      { label: "Alpha", description: "", key: "second" }
    ];

    expect(fuzzySearch("alpha", tied, fields).map(({ item }) => item.key)).toEqual([
      "first",
      "second"
    ]);
  });
});
