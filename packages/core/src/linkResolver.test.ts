import { describe, expect, it } from "vitest";

import { resolveWikiLinkTarget, type NoteIndexEntry } from "./linkResolver";

/** Helper: builds a NoteIndexEntry with sensible defaults. */
function entry(
  relativePath: string,
  overrides: Partial<NoteIndexEntry> = {}
): NoteIndexEntry {
  return {
    relativePath,
    fileName: relativePath.split("/").pop() ?? relativePath,
    aliases: [],
    ...overrides
  };
}

describe("resolveWikiLinkTarget", () => {
  const notes: readonly NoteIndexEntry[] = [
    entry("My Note.md"),
    entry("folder/Project.md", { title: "Project Plan" }),
    entry("scratchpad.md", { aliases: ["Scratchpad", "Jot"] }),
    entry("folder/sub/Deep.md", { title: "My Note" }),
    entry("README.md")
  ];

  it("resolves by exact filename match", () => {
    expect(resolveWikiLinkTarget("My Note", notes)).toBe("My Note.md");
    expect(resolveWikiLinkTarget("README", notes)).toBe("README.md");
  });

  it("resolves by frontmatter title match", () => {
    expect(resolveWikiLinkTarget("Project Plan", notes)).toBe("folder/Project.md");
  });

  it("resolves by frontmatter alias match", () => {
    expect(resolveWikiLinkTarget("Scratchpad", notes)).toBe("scratchpad.md");
    expect(resolveWikiLinkTarget("Jot", notes)).toBe("scratchpad.md");
  });

  it("resolves by relative path match", () => {
    expect(resolveWikiLinkTarget("folder/sub/Deep", notes)).toBe("folder/sub/Deep.md");
    expect(resolveWikiLinkTarget("folder/sub/Deep.md", notes)).toBe("folder/sub/Deep.md");
  });

  it("resolves by last path segment when full path does not match", () => {
    // "Deep" matches the last segment of "folder/sub/Deep.md" via path matching.
    expect(resolveWikiLinkTarget("Deep", notes)).toBe("folder/sub/Deep.md");
  });

  it("returns null for an unresolved target", () => {
    expect(resolveWikiLinkTarget("Nonexistent", notes)).toBeNull();
  });

  it("normalizes case-insensitively", () => {
    expect(resolveWikiLinkTarget("my note", notes)).toBe("My Note.md");
    expect(resolveWikiLinkTarget("project plan", notes)).toBe("folder/Project.md");
    expect(resolveWikiLinkTarget("scratchpad", notes)).toBe("scratchpad.md");
  });

  it("ignores .md extension differences", () => {
    expect(resolveWikiLinkTarget("My Note.md", notes)).toBe("My Note.md");
    expect(resolveWikiLinkTarget("README.md", notes)).toBe("README.md");
  });

  it("ignores .markdown extension differences", () => {
    const withMarkdown: readonly NoteIndexEntry[] = [
      entry("Alt.markdown")
    ];
    expect(resolveWikiLinkTarget("Alt", withMarkdown)).toBe("Alt.markdown");
    expect(resolveWikiLinkTarget("Alt.markdown", withMarkdown)).toBe("Alt.markdown");
  });

  it("filename match takes priority over title match", () => {
    // "My Note" matches both the filename of "My Note.md" and the title of
    // "folder/sub/Deep.md". Filename wins.
    expect(resolveWikiLinkTarget("My Note", notes)).toBe("My Note.md");
  });

  it("title match takes priority over alias match", () => {
    const local: readonly NoteIndexEntry[] = [
      entry("a.md", { title: "Shared" }),
      entry("b.md", { aliases: ["Shared"] })
    ];
    expect(resolveWikiLinkTarget("Shared", local)).toBe("a.md");
  });

  it("alias match takes priority over path match", () => {
    const local: readonly NoteIndexEntry[] = [
      entry("shared.md", { aliases: ["Shared"] }),
      entry("folder/Shared.md")
    ];
    expect(resolveWikiLinkTarget("Shared", local)).toBe("shared.md");
  });

  it("breaks ties by shortest relativePath, then alphabetically", () => {
    // Two notes with the same title — shorter path wins.
    const ambiguous: readonly NoteIndexEntry[] = [
      entry("folder/deep/note.md", { title: "Same" }),
      entry("a/note.md", { title: "Same" })
    ];
    expect(resolveWikiLinkTarget("Same", ambiguous)).toBe("a/note.md");

    // Same path length — alphabetical.
    const sameDepth: readonly NoteIndexEntry[] = [
      entry("b/note.md", { title: "Tie" }),
      entry("a/note.md", { title: "Tie" })
    ];
    expect(resolveWikiLinkTarget("Tie", sameDepth)).toBe("a/note.md");
  });

  it("returns null for an empty target", () => {
    expect(resolveWikiLinkTarget("", notes)).toBeNull();
    expect(resolveWikiLinkTarget("   ", notes)).toBeNull();
  });

  it("returns null for an empty note list", () => {
    expect(resolveWikiLinkTarget("anything", [])).toBeNull();
  });

  it("trims whitespace in the target", () => {
    expect(resolveWikiLinkTarget("  My Note  ", notes)).toBe("My Note.md");
  });
});
