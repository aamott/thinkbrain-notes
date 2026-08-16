// @vitest-environment happy-dom
import type { CompletionContext } from "@codemirror/autocomplete";
import { describe, expect, it } from "vitest";
import type { NoteIndexEntry } from "@thinkbrain/core";

import { wikiLinkAutocomplete, wikiLinkCompletionSourceForTest } from "./wikiLinkAutocomplete";

/**
 * Minimal `CompletionContext` stand-in that lets us drive the autocomplete
 * source directly without mounting the full `autocompletion` extension.
 *
 * Only the members the source reads (`matchBefore`, `pos`, `explicit`) are
 * implemented; the rest throw so a future change to the source surfaces clearly.
 */
function mockContext(doc: string, pos: number, explicit = false): CompletionContext {
  return {
    pos,
    explicit,
    matchBefore(from: RegExp) {
      const text = doc.slice(0, pos);
      const match = from.exec(text);
      if (!match) return null;
      const start = match.index;
      return { from: start, to: pos, text: text.slice(start, pos) };
    },
    abort() {
      throw new Error("abort not expected in unit tests");
    },
    tokenBefore() {
      throw new Error("tokenBefore not expected in unit tests");
    }
  } as unknown as CompletionContext;
}

const NOTES: readonly NoteIndexEntry[] = [
  { relativePath: "Project Plan.md", fileName: "Project Plan.md", title: undefined, aliases: [] },
  { relativePath: "folder/Other.md", fileName: "Other.md", title: "Other Title", aliases: ["alt-name"] },
  { relativePath: "deep/Project Notes.md", fileName: "Project Notes.md", title: "Notes", aliases: ["proj-alias"] }
];

const source = wikiLinkCompletionSourceForTest(NOTES);

describe("wikiLinkAutocomplete source filtering", () => {
  it("returns all notes for an empty query after [[", () => {
    const result = source(mockContext("see [[", 6));
    expect(result).not.toBeNull();
    expect(result!.options).toHaveLength(3);
  });

  it("filters by filename (case-insensitive substring)", () => {
    const result = source(mockContext("see [[proj", 10));
    expect(result).not.toBeNull();
    const labels = result!.options.map((o) => o.label);
    // "Project Plan" (filename) and "Project Notes" (filename) match "proj".
    expect(labels).toContain("Project Plan");
    expect(labels).toContain("Notes");
  });

  it("matches by title", () => {
    const result = source(mockContext("see [[other title", 17));
    expect(result).not.toBeNull();
    const labels = result!.options.map((o) => o.label);
    expect(labels).toContain("Other Title");
  });

  it("matches by alias", () => {
    const result = source(mockContext("see [[alt-name", 15));
    expect(result).not.toBeNull();
    const labels = result!.options.map((o) => o.label);
    expect(labels).toContain("Other Title");
  });

  it("uses title as label when present, otherwise filename without extension", () => {
    const result = source(mockContext("see [[", 6));
    expect(result).not.toBeNull();
    const byLabel = new Map(result!.options.map((o) => [o.label, o]));
    // No title -> filename without extension.
    expect(byLabel.has("Project Plan")).toBe(true);
    // Has title -> title is the label.
    expect(byLabel.has("Other Title")).toBe(true);
    expect(byLabel.has("Notes")).toBe(true);
  });

  it("uses the note relative path as detail", () => {
    const result = source(mockContext("see [[other", 11));
    expect(result).not.toBeNull();
    const other = result!.options.find((o) => o.label === "Other Title");
    expect(other?.detail).toBe("folder/Other.md");
  });

  it("applies [[Target]] using the filename without extension", () => {
    const result = source(mockContext("see [[other", 11));
    expect(result).not.toBeNull();
    const other = result!.options.find((o) => o.label === "Other Title");
    expect(other?.apply).toBe("[[Other]]");
  });

  it("replaces the entire [[partial text including brackets", () => {
    const result = source(mockContext("see [[proj", 10));
    expect(result).not.toBeNull();
    // `from` should point at the first `[` so the whole `[[proj` is replaced.
    expect(result!.from).toBe(4);
    expect(result!.to).toBe(10);
  });

  it("ranks filename matches above title and alias matches", () => {
    // Dedicated set where "alpha" matches one note by filename and a different
    // note only by alias, so the filename hit must sort above the alias hit.
    const rankedNotes: readonly NoteIndexEntry[] = [
      { relativePath: "Alpha File.md", fileName: "Alpha File.md", title: undefined, aliases: [] },
      { relativePath: "folder/Zeta.md", fileName: "Zeta.md", title: undefined, aliases: ["alpha-alias"] }
    ];
    const rankedSource = wikiLinkCompletionSourceForTest(rankedNotes);
    const result = rankedSource(mockContext("see [[alpha", 11));
    expect(result).not.toBeNull();
    expect(result!.options[0]!.label).toBe("Alpha File");
    expect(result!.options[1]!.label).toBe("Zeta");
  });

  it("breaks rank ties alphabetically by label", () => {
    // "proj" matches both filenames at rank 0; alphabetical order wins.
    const result = source(mockContext("see [[proj", 10));
    expect(result).not.toBeNull();
    const labels = result!.options.map((o) => o.label);
    expect(labels).toStrictEqual(["Notes", "Project Plan"]);
  });

  it("does NOT trigger outside a [[...]] context", () => {
    expect(source(mockContext("plain text", 10))).toBeNull();
    expect(source(mockContext("see [single", 11))).toBeNull();
    expect(source(mockContext("see [[done]] after", 18))).toBeNull();
  });

  it("does not trigger after a pipe (alias portion)", () => {
    expect(source(mockContext("see [[Target|ali", 17))).toBeNull();
  });

  it("returns null when no notes match", () => {
    expect(source(mockContext("see [[zzznomatch", 16))).toBeNull();
  });
});

describe("wikiLinkAutocomplete extension", () => {
  it("returns an empty extension for an empty note index", () => {
    const ext = wikiLinkAutocomplete([]);
    expect(Array.isArray(ext) ? ext : [ext]).toHaveLength(0);
  });

  it("returns a non-empty extension for a populated note index", () => {
    const ext = wikiLinkAutocomplete(NOTES);
    expect(Array.isArray(ext) ? ext.length : 1).toBeGreaterThan(0);
  });
});
