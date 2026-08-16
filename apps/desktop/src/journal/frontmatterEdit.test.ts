import { describe, expect, it } from "vitest";

import { setFrontmatterField } from "./frontmatterEdit";

const note = (frontmatter: string, body = "Bread needed more salt.\n") =>
  `---\n${frontmatter}---\n\n${body}`;

describe("setFrontmatterField", () => {
  it("adds a key to an existing block, leaving everything else byte for byte", () => {
    const before = note("date: 2026-08-07\n");

    expect(setFrontmatterField(before, "mood", "good")).toBe(
      note("date: 2026-08-07\nmood: good\n")
    );
  });

  it("replaces only the line it owns", () => {
    const before = note("date: 2026-08-07\nmood: okay\nenergy: 4\n");

    expect(setFrontmatterField(before, "mood", "good")).toBe(
      note("date: 2026-08-07\nmood: good\nenergy: 4\n")
    );
  });

  it("removes the line when the value is cleared", () => {
    const before = note("date: 2026-08-07\nmood: good\nenergy: 4\n");

    expect(setFrontmatterField(before, "mood", undefined)).toBe(
      note("date: 2026-08-07\nenergy: 4\n")
    );
  });

  it("leaves a note untouched when clearing a key it never had", () => {
    const before = note("date: 2026-08-07\n");

    expect(setFrontmatterField(before, "mood", undefined)).toBe(before);
  });

  it("keeps comments, blank lines and key order exactly as written", () => {
    // Reading a note is not permission to reformat it (D33/D50).
    const before = note("# my own notes\n\ndate: 2026-08-07\n\ntags: [a, b]\n");

    expect(setFrontmatterField(before, "energy", 7)).toBe(
      note("# my own notes\n\ndate: 2026-08-07\n\ntags: [a, b]\nenergy: 7\n")
    );
  });

  it("writes a list as flow style, which stays legible in a plain text viewer (D3)", () => {
    const before = note("date: 2026-08-07\n");

    expect(setFrontmatterField(before, "context", ["baking", "reading"])).toContain(
      "context: [baking, reading]"
    );
  });

  it("quotes a string that YAML would otherwise read as something else", () => {
    const before = note("date: 2026-08-07\n");

    expect(setFrontmatterField(before, "note", "yes: really")).toContain(
      'note: "yes: really"'
    );
    expect(setFrontmatterField(before, "note", "true")).toContain('note: "true"');
    expect(setFrontmatterField(before, "note", "7")).toContain('note: "7"');
  });

  it("writes a number bare", () => {
    expect(setFrontmatterField(note("date: 2026-08-07\n"), "energy", 7)).toContain(
      "energy: 7"
    );
  });

  it("creates a block for a note that has none, keeping the body intact", () => {
    const result = setFrontmatterField("Just prose.\n", "mood", "good");

    expect(result).toBe("---\nmood: good\n---\n\nJust prose.\n");
  });

  it("does not create a block just to clear a key", () => {
    expect(setFrontmatterField("Just prose.\n", "mood", undefined)).toBe("Just prose.\n");
  });

  it("preserves CRLF line endings when the file uses them", () => {
    const before = "---\r\ndate: 2026-08-07\r\n---\r\n\r\nBody\r\n";

    expect(setFrontmatterField(before, "mood", "good")).toBe(
      "---\r\ndate: 2026-08-07\r\nmood: good\r\n---\r\n\r\nBody\r\n"
    );
  });

  it("leaves a damaged block alone rather than guessing at a repair", () => {
    // No closing delimiter: this note is not something we understand, and
    // rewriting it would be worse than declining (D50).
    const damaged = "---\ndate: 2026-08-07\nstill going\n";

    expect(setFrontmatterField(damaged, "mood", "good")).toBe(damaged);
  });
});
