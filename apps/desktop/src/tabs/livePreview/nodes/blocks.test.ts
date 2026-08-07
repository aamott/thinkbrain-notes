// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import { mountPreview, type PreviewHandle } from "../harness";

let preview: PreviewHandle | null = null;

afterEach(() => {
  preview?.destroy();
  preview = null;
});

describe("blockquote live preview", () => {
  it("hides the quote marker when the cursor is elsewhere", () => {
    preview = mountPreview("> quoted\n\nafter", 11);
    expect(preview.lineText(1)).toBe("quoted");
  });

  it("reveals the quote marker when the cursor is on the line", () => {
    preview = mountPreview("> quoted\n\nafter", 4);
    expect(preview.lineText(1)).toBe("> quoted");
  });

  it("styles every line of the quote", () => {
    preview = mountPreview("> one\n> two\n\nafter", 14);
    expect(preview.lineClass(1)).toContain("cm-quote-line");
    expect(preview.lineClass(2)).toContain("cm-quote-line");
  });
});

describe("horizontal rule live preview", () => {
  it("hides the dashes and styles the line as a rule", () => {
    preview = mountPreview("a\n\n---\n\nb", 0);
    expect(preview.lineText(3)).toBe("");
    expect(preview.lineClass(3)).toContain("cm-hr-line");
  });

  it("reveals the dashes when the cursor is on the line", () => {
    preview = mountPreview("a\n\n---\n\nb", 4);
    expect(preview.lineText(3)).toBe("---");
  });
});
