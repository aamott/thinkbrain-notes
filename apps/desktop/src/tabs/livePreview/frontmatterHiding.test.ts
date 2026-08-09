// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import { mountPreview, type PreviewHandle } from "./harness";
import { themeRules } from "./theme";

/**
 * D88: frontmatter follows live preview's existing bargain.
 *
 * Hidden while you are reading, shown when the cursor arrives — the same deal
 * `#` and `**` already get. The one exception is a block that will not parse:
 * hiding that would hide the evidence.
 */

let preview: PreviewHandle | null = null;

afterEach(() => {
  preview?.destroy();
  preview = null;
});

const NOTE = "---\ndate: 2026-08-08\nmood: happy\n---\n\nBread needed more salt.\n";

describe("hiding frontmatter", () => {
  // Hidden by a line class and a `display: none` rule, so the document is never
  // touched. That means asserting the mechanism: the class on every line of the
  // block, and the rule that acts on it.
  it("hides every line of the block while reading", () => {
    preview = mountPreview(NOTE, NOTE.length - 1);

    for (const line of [1, 2, 3, 4]) {
      expect(preview.lineClass(line)).toContain("cm-frontmatter-hidden");
    }
  });

  it("has a rule that actually hides that class", () => {
    expect(JSON.stringify(themeRules)).toContain('"display":"none"');
  });

  it("leaves the prose exactly as it was", () => {
    preview = mountPreview(NOTE, NOTE.length - 1);

    expect(preview.lineText(6)).toBe("Bread needed more salt.");
  });

  it("reveals the block when the cursor is inside it", () => {
    // Cursor on the `mood:` line.
    preview = mountPreview(NOTE, NOTE.indexOf("mood"));

    expect(preview.lineClass(3)).not.toContain("cm-frontmatter-hidden");
    expect(preview.lineText(3)).toBe("mood: happy");
  });

  it("reveals it from the opening fence too", () => {
    preview = mountPreview(NOTE, 0);

    expect(preview.lineClass(1)).not.toContain("cm-frontmatter-hidden");
    expect(preview.lineText(1)).toBe("---");
  });

  // The block is the evidence for the diagnostic the journal shows; hiding it
  // would leave someone told their frontmatter is broken and unable to see it.
  it("never hides a block that will not parse", () => {
    const broken = "---\ndate: 2026-08-08\nmood: [happy\n---\n\nBread.\n";
    preview = mountPreview(broken, broken.length - 1);

    expect(preview.lineClass(3)).not.toContain("cm-frontmatter-hidden");
    expect(preview.lineText(3)).toBe("mood: [happy");
  });

  it("leaves a note without frontmatter alone", () => {
    const plain = "# Heading\n\nBread needed more salt.\n";
    preview = mountPreview(plain, plain.length - 1);

    expect(preview.lineText(3)).toBe("Bread needed more salt.");
  });

  // `---` mid-document is a horizontal rule, not a block to hide.
  it("does not hide a rule further down the page", () => {
    const source = "Bread.\n\n---\n\nMore bread.\n";
    preview = mountPreview(source, source.length - 1);

    expect(preview.lineClass(3)).not.toContain("cm-frontmatter-hidden");
    expect(preview.lineText(1)).toBe("Bread.");
  });
});
