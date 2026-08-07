// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import { mountPreview, type PreviewHandle } from "../harness";

let preview: PreviewHandle | null = null;

afterEach(() => {
  preview?.destroy();
  preview = null;
});

describe("inline code live preview", () => {
  it("hides backticks when the cursor is elsewhere", () => {
    preview = mountPreview("run `npm test` now", 0);
    expect(preview.lineText(1)).toBe("run npm test now");
  });

  it("reveals backticks when the cursor is inside the span", () => {
    preview = mountPreview("run `npm test` now", 8);
    expect(preview.lineText(1)).toBe("run `npm test` now");
  });

  it("styles the span as code", () => {
    preview = mountPreview("run `npm test` now", 0);
    expect(preview.view.dom.querySelector(".cm-inline-code")).not.toBeNull();
  });
});

describe("fenced code live preview", () => {
  const source = "text\n\n```js\nlet a = 1;\n```\n\nmore";

  it("hides both fences when the cursor is outside the block", () => {
    preview = mountPreview(source, 0);
    expect(preview.lineText(3)).toBe("");
    expect(preview.lineText(5)).toBe("");
  });

  it("reveals a fence when the cursor is on that fence line", () => {
    preview = mountPreview(source, 8);
    expect(preview.lineText(3)).toBe("```js");
  });

  it("marks every line of the block, with rounded first and last", () => {
    preview = mountPreview(source, 0);
    expect(preview.lineClass(3)).toContain("cm-code-line-first");
    expect(preview.lineClass(4)).toContain("cm-code-line");
    expect(preview.lineClass(5)).toContain("cm-code-line-last");
  });

  it("never alters the document", () => {
    preview = mountPreview(source, 0);
    expect(preview.view.state.doc.toString()).toBe(source);
  });
});
