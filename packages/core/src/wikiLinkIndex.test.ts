import { describe, expect, it } from "vitest";

import { parseNote } from "./markdown";
import { resolveWikiLinkTarget } from "./linkResolver";
import {
  addNote,
  buildWikiLinkIndex,
  buildNoteIndexEntry,
  getBacklinks,
  getForwardLinks,
  getUnresolvedReferences,
  removeNote,
  type WikiLinkIndexInput
} from "./wikiLinkIndex";

/** Helper: parses markdown and pairs it with a relative path. */
function note(relativePath: string, markdown: string): WikiLinkIndexInput {
  return { relativePath, parsedNote: parseNote(markdown) };
}

describe("buildNoteIndexEntry", () => {
  it("extracts fileName, title, and aliases from parsed notes", () => {
    const entries = [
      note("folder/My Note.md", "---\ntitle: Plan\naliases: [A, B]\n---\nbody"),
      note("README.md", "# README")
    ].map(buildNoteIndexEntry);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      relativePath: "folder/My Note.md",
      fileName: "My Note.md",
      title: "Plan",
      aliases: ["A", "B"]
    });
    expect(entries[1]).toEqual({
      relativePath: "README.md",
      fileName: "README.md",
      title: undefined,
      aliases: []
    });
  });
});

describe("buildWikiLinkIndex", () => {
  const inputs: WikiLinkIndexInput[] = [
    // A links to B (by filename) and to Nonexistent.
    note("A.md", "[[B]] [[Nonexistent]]"),
    // B links to A (by title).
    note("folder/B.md", "---\ntitle: Bee\n---\n[[Bee]]"),
    // C links to B by alias.
    note("C.md", "---\naliases: [Other]\n---\n[[Other]]")
  ];

  const index = buildWikiLinkIndex(inputs);

  it("builds the forward map with deduplicated, order-preserving targets", () => {
    expect(getForwardLinks(index, "A.md")).toEqual(["B", "Nonexistent"]);
    expect(getForwardLinks(index, "folder/B.md")).toEqual(["Bee"]);
    expect(getForwardLinks(index, "C.md")).toEqual(["Other"]);
  });

  it("deduplicates repeated targets in a single note", () => {
    const idx = buildWikiLinkIndex([note("X.md", "[[A]] [[A]] [[A]]")]);
    expect(getForwardLinks(idx, "X.md")).toEqual(["A"]);
  });

  it("resolves targets using resolveWikiLinkTarget (filename, title, alias, path)", () => {
    const noteIndex = index.noteIndex;
    // By filename.
    expect(resolveWikiLinkTarget("B", noteIndex)).toBe("folder/B.md");
    // By title.
    expect(resolveWikiLinkTarget("Bee", noteIndex)).toBe("folder/B.md");
    // By alias.
    expect(resolveWikiLinkTarget("Other", noteIndex)).toBe("C.md");
    // By path.
    expect(resolveWikiLinkTarget("folder/B", noteIndex)).toBe("folder/B.md");
  });

  it("builds the reverse backlinks map", () => {
    // A links to B by filename.
    expect(getBacklinks(index, "folder/B.md")).toContain("A.md");
    // B links to itself by title ("Bee" -> folder/B.md).
    expect(getBacklinks(index, "folder/B.md")).toContain("folder/B.md");
    // C links to B by alias ("Other" -> C.md, not B). Wait: "Other" is C's own
    // alias, so [[Other]] resolves to C.md, meaning C links to itself.
    expect(getBacklinks(index, "C.md")).toContain("C.md");
  });

  it("tracks unresolved targets", () => {
    expect(getUnresolvedReferences(index, "Nonexistent")).toContain("A.md");
    // A resolved target is not in the unresolved map.
    expect(getUnresolvedReferences(index, "B")).toEqual([]);
  });

  it("returns empty arrays for unknown paths/targets", () => {
    expect(getBacklinks(index, "nope.md")).toEqual([]);
    expect(getForwardLinks(index, "nope.md")).toEqual([]);
    expect(getUnresolvedReferences(index, "nope")).toEqual([]);
  });
});

describe("addNote (incremental)", () => {
  it("adds a new note with links and updates backlinks", () => {
    const index = buildWikiLinkIndex([
      note("A.md", "[[B]]"),
      note("B.md", "body")
    ]);
    // Initially A links to B.
    expect(getBacklinks(index, "B.md")).toEqual(["A.md"]);

    // Add a new note C that links to B.
    const next = addNote(index, note("C.md", "[[B]]"));
    expect(getForwardLinks(next, "C.md")).toEqual(["B"]);
    expect([...getBacklinks(next, "B.md")].sort()).toEqual(["A.md", "C.md"]);
  });

  it("updates links on save (note content changed)", () => {
    const index = buildWikiLinkIndex([
      note("A.md", "[[B]] [[C]]"),
      note("B.md", "body"),
      note("C.md", "body")
    ]);
    expect(getBacklinks(index, "B.md")).toEqual(["A.md"]);
    expect(getBacklinks(index, "C.md")).toEqual(["A.md"]);

    // A is saved with new content: now only links to B.
    const next = addNote(index, note("A.md", "[[B]]"));
    expect(getForwardLinks(next, "A.md")).toEqual(["B"]);
    expect(getBacklinks(next, "B.md")).toEqual(["A.md"]);
    // C no longer has a backlink from A.
    expect(getBacklinks(next, "C.md")).toEqual([]);
  });

  it("re-resolves links when a note's title changes", () => {
    // B has title "Old". A links to [[Old]].
    const index = buildWikiLinkIndex([
      note("A.md", "[[Old]]"),
      note("B.md", "---\ntitle: Old\n---\nbody")
    ]);
    expect(getBacklinks(index, "B.md")).toEqual(["A.md"]);

    // B is saved with a new title "New". Now [[Old]] is unresolved.
    const next = addNote(index, note("B.md", "---\ntitle: New\n---\nbody"));
    expect(getBacklinks(next, "B.md")).toEqual([]);
    expect(getUnresolvedReferences(next, "Old")).toEqual(["A.md"]);
  });

  it("resolves a previously unresolved target when a matching note is added", () => {
    const index = buildWikiLinkIndex([
      note("A.md", "[[Target]]")
    ]);
    expect(getUnresolvedReferences(index, "Target")).toEqual(["A.md"]);

    // Add a note whose filename matches the target.
    const next = addNote(index, note("Target.md", "body"));
    expect(getUnresolvedReferences(next, "Target")).toEqual([]);
    expect(getBacklinks(next, "Target.md")).toEqual(["A.md"]);
  });
});

describe("removeNote (incremental)", () => {
  it("removes a note and its forward links", () => {
    const index = buildWikiLinkIndex([
      note("A.md", "[[B]]"),
      note("B.md", "body")
    ]);
    const next = removeNote(index, "A.md");
    expect(getForwardLinks(next, "A.md")).toEqual([]);
    expect(getBacklinks(next, "B.md")).toEqual([]);
  });

  it("removes a note from the note index so links to it become unresolved", () => {
    const index = buildWikiLinkIndex([
      note("A.md", "[[B]]"),
      note("B.md", "body")
    ]);
    expect(getBacklinks(index, "B.md")).toEqual(["A.md"]);

    const next = removeNote(index, "B.md");
    // B is gone, so [[B]] from A is now unresolved.
    expect(getBacklinks(next, "B.md")).toEqual([]);
    expect(getUnresolvedReferences(next, "B")).toEqual(["A.md"]);
    expect(next.noteIndex.find((n) => n.relativePath === "B.md")).toBeUndefined();
  });

  it("handles removing a note that nothing links to", () => {
    const index = buildWikiLinkIndex([
      note("A.md", "[[B]]"),
      note("B.md", "body"),
      note("C.md", "lonely")
    ]);
    const next = removeNote(index, "C.md");
    expect(getForwardLinks(next, "C.md")).toEqual([]);
    expect(getBacklinks(next, "B.md")).toEqual(["A.md"]);
  });
});
