import { describe, expect, it } from "vitest";

import { previewText } from "./tabPreview";

describe("previewText", () => {
  it("returns the opening prose", () => {
    expect(previewText("# Weekly review\nShipped the vault path.")).toBe(
      "# Weekly review Shipped the vault path."
    );
  });

  it("strips YAML frontmatter, which would otherwise be every card's preview", () => {
    const note = "---\ntitle: Weekly review\ntags: [work]\n---\nShipped the vault path.";

    expect(previewText(note)).toBe("Shipped the vault path.");
  });

  it("collapses blank lines and runs of whitespace", () => {
    expect(previewText("First\n\n\n   Second")).toBe("First Second");
  });

  it("truncates with an ellipsis at the limit", () => {
    const prose = "a".repeat(200);
    expect(previewText(prose)).toBe(`${"a".repeat(180)}…`);
  });

  it("does not append an ellipsis when the text already fits", () => {
    expect(previewText("abc")).toBe("abc");
  });

  it("returns an empty string for a document that is only frontmatter", () => {
    expect(previewText("---\ntitle: Empty\n---\n")).toBe("");
  });

  it("returns an empty string for content that has not loaded yet", () => {
    expect(previewText("")).toBe("");
  });

  // A note whose fence was never closed is not frontmatter; the parser hands the
  // whole file back as body rather than swallowing it, and the card must show it.
  it("keeps the text of a note whose frontmatter fence is unclosed", () => {
    expect(previewText("---\ntitle: Broken\nStill prose.")).toBe("--- title: Broken Still prose.");
  });
});
