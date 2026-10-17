import { describe, expect, it } from "vitest";

import {
  resolveMarkdownLinkTarget,
  resolveWikiLinkNavigationTarget,
  resolveWikiLinkTarget,
  type NoteIndexEntry
} from "./linkResolver";

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

describe("resolveMarkdownLinkTarget", () => {
  const notes: readonly NoteIndexEntry[] = [
    entry("My Note.md"),
    entry("folder/Project.md"),
    entry("folder/sub/Deep.md")
  ];

  it("hands external schemes back as URLs", () => {
    expect(resolveMarkdownLinkTarget("https://example.com/x", "a/b.md", notes)).toEqual({
      kind: "external",
      url: "https://example.com/x"
    });
    expect(resolveMarkdownLinkTarget("mailto:a@b.c", "a/b.md", notes)).toEqual({
      kind: "external",
      url: "mailto:a@b.c"
    });
  });

  it("upgrades protocol-relative URLs to https", () => {
    expect(resolveMarkdownLinkTarget("//example.com/x", "a/b.md", notes)).toEqual({
      kind: "external",
      url: "https://example.com/x"
    });
  });

  it("refuses schemes the OS should never open", () => {
    // javascript:/data:/file: et al. must not reach an OS handler that could
    // run or open them — they resolve to nothing and render as broken.
    expect(resolveMarkdownLinkTarget("javascript:alert(1)", "a.md", notes)).toBeNull();
    expect(resolveMarkdownLinkTarget("data:text/html,<b>x</b>", "a.md", notes)).toBeNull();
    expect(resolveMarkdownLinkTarget("file:///etc/passwd", "a.md", notes)).toBeNull();
    expect(resolveMarkdownLinkTarget("ftp://example.com/x", "a.md", notes)).toBeNull();
  });

  it("allows phone-call and mail schemes", () => {
    expect(resolveMarkdownLinkTarget("tel:+15551234", "a.md", notes)).toEqual({
      kind: "external",
      url: "tel:+15551234"
    });
  });

  it("resolves a target relative to the containing note's folder", () => {
    expect(resolveMarkdownLinkTarget("Project.md", "folder/home.md", notes)).toEqual({
      kind: "internal",
      relativePath: "folder/Project.md"
    });
    expect(resolveMarkdownLinkTarget("sub/Deep.md", "folder/home.md", notes)).toEqual({
      kind: "internal",
      relativePath: "folder/sub/Deep.md"
    });
  });

  it("prefers the same-folder file over a root one with the same name", () => {
    const both: readonly NoteIndexEntry[] = [entry("note.md"), entry("folder/note.md")];
    expect(resolveMarkdownLinkTarget("note.md", "folder/home.md", both)).toEqual({
      kind: "internal",
      relativePath: "folder/note.md"
    });
  });

  it("still finds notes the relative join misses via vault-wide lookup", () => {
    // Bare-name link inside a folder: the join `folder/My Note` misses, but
    // the fileName match on the verbatim target finds the root note.
    expect(resolveMarkdownLinkTarget("My Note", "folder/home.md", notes)).toEqual({
      kind: "internal",
      relativePath: "My Note.md"
    });
    // A verbatim vault-relative path joins to itself and matches.
    expect(resolveMarkdownLinkTarget("folder/Project.md", "other/home.md", notes)).toEqual({
      kind: "internal",
      relativePath: "folder/Project.md"
    });
  });

  it("climbs out of the folder with .. and treats / as vault root", () => {
    expect(resolveMarkdownLinkTarget("../My Note.md", "folder/home.md", notes)).toEqual({
      kind: "internal",
      relativePath: "My Note.md"
    });
    expect(resolveMarkdownLinkTarget("/folder/Project.md", "deep/in/here.md", notes)).toEqual({
      kind: "internal",
      relativePath: "folder/Project.md"
    });
  });

  it("drops the #anchor suffix before resolving the file part", () => {
    expect(resolveMarkdownLinkTarget("Project.md#section", "folder/home.md", notes)).toEqual({
      kind: "internal",
      relativePath: "folder/Project.md"
    });
  });

  it("unwraps angle-bracketed targets and decodes %20", () => {
    expect(resolveMarkdownLinkTarget("<Project.md>", "folder/home.md", notes)).toEqual({
      kind: "internal",
      relativePath: "folder/Project.md"
    });
    expect(resolveMarkdownLinkTarget("My%20Note.md", "x.md", notes)).toEqual({
      kind: "internal",
      relativePath: "My Note.md"
    });
  });

  it("resolves non-Markdown files optimistically", () => {
    expect(resolveMarkdownLinkTarget("img/logo.png", "folder/home.md", notes)).toEqual({
      kind: "internal",
      relativePath: "folder/img/logo.png"
    });
  });

  it("returns null for empty and escaping targets", () => {
    expect(resolveMarkdownLinkTarget("", "a.md", notes)).toBeNull();
    expect(resolveMarkdownLinkTarget("   ", "a.md", notes)).toBeNull();
    expect(resolveMarkdownLinkTarget("../../outside.md", "a/b.md", notes)).toBeNull();
  });

  it("resolves an anchor-only target as a same-note heading jump", () => {
    expect(resolveMarkdownLinkTarget("#section", "a.md", notes)).toEqual({
      kind: "heading",
      fragment: "section"
    });
    // Encoded exactly once: `%20` becomes a space, `%2520` becomes `%20`.
    expect(resolveMarkdownLinkTarget("#My%20Heading", "a.md", notes)).toEqual({
      kind: "heading",
      fragment: "My Heading"
    });
    expect(resolveMarkdownLinkTarget("#My%2520Heading", "a.md", notes)).toEqual({
      kind: "heading",
      fragment: "My%20Heading"
    });
    // `#` alone is the top of the note.
    expect(resolveMarkdownLinkTarget("#", "a.md", notes)).toEqual({
      kind: "heading",
      fragment: ""
    });
  });
});

describe("resolveWikiLinkNavigationTarget", () => {
  it("resolves `[[#Heading]]` as a same-note heading with no index", () => {
    expect(resolveWikiLinkNavigationTarget("#Deep Section", [])).toEqual({
      kind: "heading",
      fragment: "Deep Section"
    });
    expect(resolveWikiLinkNavigationTarget(" # ", [])).toEqual({
      kind: "heading",
      fragment: ""
    });
  });

  it("delegates ordinary targets to the note index", () => {
    const notes = [entry("folder/Note.md")];
    expect(resolveWikiLinkNavigationTarget("Note", notes)).toEqual({
      kind: "internal",
      relativePath: "folder/Note.md"
    });
    expect(resolveWikiLinkNavigationTarget("Missing", notes)).toBeNull();
  });
});
