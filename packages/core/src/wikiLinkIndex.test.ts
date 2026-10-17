import { describe, expect, it } from "vitest";

import { parseNote } from "./markdown";
import { resolveWikiLinkTarget } from "./linkResolver";
import {
  addNote,
  buildWikiLinkIndex,
  getBacklinkDetails,
  getBacklinks,
  removeNote,
  type WikiLinkIndex,
  type WikiLinkIndexInput
} from "./wikiLinkIndex";

/** Helper: parses markdown and pairs it with a relative path. */
function note(relativePath: string, contents: string): WikiLinkIndexInput {
  return { relativePath, contents, parsedNote: parseNote(contents) };
}

/** Helper: raw targets a note links to, from the public forward map. */
function forwardTargets(
  index: WikiLinkIndex,
  relativePath: string
): readonly string[] {
  return (index.forward.get(relativePath) ?? []).map((link) => link.target);
}

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

  it("builds note index entries with fileName, title, and aliases", () => {
    expect(index.noteIndex).toEqual([
      {
        relativePath: "A.md",
        fileName: "A.md",
        title: undefined,
        aliases: []
      },
      {
        relativePath: "folder/B.md",
        fileName: "B.md",
        title: "Bee",
        aliases: []
      },
      {
        relativePath: "C.md",
        fileName: "C.md",
        title: undefined,
        aliases: ["Other"]
      }
    ]);
  });

  it("builds the forward map with deduplicated, order-preserving targets", () => {
    expect(forwardTargets(index, "A.md")).toEqual(["B", "Nonexistent"]);
    expect(forwardTargets(index, "folder/B.md")).toEqual(["Bee"]);
    expect(forwardTargets(index, "C.md")).toEqual(["Other"]);
  });

  it("deduplicates repeated targets in a single note", () => {
    const idx = buildWikiLinkIndex([note("X.md", "[[A]] [[A]] [[A]]")]);
    expect(forwardTargets(idx, "X.md")).toEqual(["A"]);
  });

  it("stores the source path and full trimmed line for each backlink", () => {
    const idx = buildWikiLinkIndex([
      note("notes/source.md", "before\n  See [[Target|display text]] for details.  \nafter"),
      note("Target.md", "body")
    ]);
    expect(getBacklinkDetails(idx, "Target.md")).toEqual([{
      relativePath: "notes/source.md",
      context: "See [[Target|display text]] for details."
    }]);
  });

  it("uses exact-source offsets after frontmatter", () => {
    const contents = "---\ntitle: Source\n---\nfirst body line\n  [[Target]] after metadata  ";
    const idx = buildWikiLinkIndex([
      note("Source.md", contents),
      note("Target.md", "body")
    ]);
    expect(getBacklinkDetails(idx, "Target.md")).toEqual([{
      relativePath: "Source.md",
      context: "[[Target]] after metadata"
    }]);
  });

  it("keeps only the first context for duplicate normalized targets", () => {
    const idx = buildWikiLinkIndex([
      note("Source.md", "first [[Target]]\nsecond [[target.md|label]]"),
      note("Target.md", "body")
    ]);
    expect(getBacklinkDetails(idx, "Target.md")).toEqual([{
      relativePath: "Source.md",
      context: "first [[Target]]"
    }]);
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
    // C links to itself via its own alias ("Other" -> C.md).
    expect(getBacklinks(index, "C.md")).toContain("C.md");
  });

  it("excludes unresolved targets from the backlinks map", () => {
    // "Nonexistent" links nowhere — nothing gains a backlink for it.
    expect(resolveWikiLinkTarget("Nonexistent", index.noteIndex)).toBeNull();
    for (const details of index.backlinks.values()) {
      expect(details.map((d) => d.context)).not.toContain("[[Nonexistent]]");
    }
  });

  it("returns empty arrays for unknown paths/targets", () => {
    expect(getBacklinks(index, "nope.md")).toEqual([]);
    expect(forwardTargets(index, "nope.md")).toEqual([]);
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
    expect(forwardTargets(next, "C.md")).toEqual(["B"]);
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
    expect(forwardTargets(next, "A.md")).toEqual(["B"]);
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

    // B is saved with a new title "New". Now [[Old]] no longer resolves.
    const next = addNote(index, note("B.md", "---\ntitle: New\n---\nbody"));
    expect(getBacklinks(next, "B.md")).toEqual([]);
    expect(resolveWikiLinkTarget("Old", next.noteIndex)).toBeNull();
  });

  it.each([
    ["filename", "Target.md", "body"],
    ["title", "Different.md", "---\ntitle: Target\n---\nbody"],
    ["alias", "Different.md", "---\naliases: [Target]\n---\nbody"]
  ])("resolves a previously dangling link after %s resolution", (_, path, contents) => {
    const index = buildWikiLinkIndex([
      note("A.md", "Context for [[Target|target note]]")
    ]);
    // Nothing resolves "Target" yet, so no backlink exists anywhere.
    expect(resolveWikiLinkTarget("Target", index.noteIndex)).toBeNull();
    expect(index.backlinks.size).toBe(0);

    const next = addNote(index, note(path, contents));
    expect(getBacklinkDetails(next, path)).toEqual([{
      relativePath: "A.md",
      context: "Context for [[Target|target note]]"
    }]);
  });
});

describe("removeNote (incremental)", () => {
  it("removes a note and its forward links", () => {
    const index = buildWikiLinkIndex([
      note("A.md", "[[B]]"),
      note("B.md", "body")
    ]);
    const next = removeNote(index, "A.md");
    expect(forwardTargets(next, "A.md")).toEqual([]);
    expect(getBacklinks(next, "B.md")).toEqual([]);
  });

  it("removes a note from the note index so links to it no longer resolve", () => {
    const index = buildWikiLinkIndex([
      note("A.md", "[[B]]"),
      note("B.md", "body")
    ]);
    expect(getBacklinks(index, "B.md")).toEqual(["A.md"]);

    const next = removeNote(index, "B.md");
    // B is gone, so [[B]] from A no longer resolves.
    expect(getBacklinks(next, "B.md")).toEqual([]);
    expect(resolveWikiLinkTarget("B", next.noteIndex)).toBeNull();
    expect(next.noteIndex.find((n) => n.relativePath === "B.md")).toBeUndefined();
  });

  it("handles removing a note that nothing links to", () => {
    const index = buildWikiLinkIndex([
      note("A.md", "[[B]]"),
      note("B.md", "body"),
      note("C.md", "lonely")
    ]);
    const next = removeNote(index, "C.md");
    expect(forwardTargets(next, "C.md")).toEqual([]);
    expect(getBacklinks(next, "B.md")).toEqual(["A.md"]);
  });
});
