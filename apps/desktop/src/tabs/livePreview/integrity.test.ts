// @vitest-environment happy-dom
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import { mountPreview, type PreviewHandle } from "./harness";

let preview: PreviewHandle | null = null;

afterEach(() => {
  preview?.destroy();
  preview = null;
});

const SAMPLE = [
  "---",
  "title: Sample",
  "---",
  "",
  "# Heading",
  "",
  "Text with **bold**, *italic*, ~~strike~~ and `code`.",
  "",
  "> A quote",
  "",
  "- [ ] task",
  "- item",
  "",
  "A [link](https://example.com) and a [[Wiki Page]].",
  "",
  "```js",
  "let a = 1;",
  "```",
  "",
  "---",
  ""
].join("\n");

describe("live preview document integrity", () => {
  it("leaves the document byte-identical after visiting every position", () => {
    preview = mountPreview(SAMPLE, 0);
    for (let pos = 0; pos <= SAMPLE.length; pos++) {
      preview.setCursor(pos);
    }
    expect(preview.view.state.doc.toString()).toBe(SAMPLE);
  });

  it("registers concealed markers as atomic ranges", () => {
    // The "## " prefix of a heading is concealed while the cursor is away, and
    // must be published as an atomic range so cursor motion steps over it
    // rather than appearing to stall on invisible characters.
    preview = mountPreview("body\n\n## hi", 0);
    const ranges = preview.view.state.facet(EditorView.atomicRanges);
    const spans: Array<{ from: number; to: number }> = [];
    for (const source of ranges) {
      source(preview.view).between(0, preview.view.state.doc.length, (from, to) => {
        spans.push({ from, to });
      });
    }
    // Heading starts at offset 6; "## " occupies 6..9.
    expect(spans).toContainEqual({ from: 6, to: 9 });
  });

  it("steps over a replaced task marker in a single cursor move", () => {
    // "- [ ] todo": the TaskMarker occupies 2..5 and is replaced by a checkbox
    // unconditionally — unlike `##` or `**`, it never reveals — so this is the
    // case where atomic ranges genuinely carry the cursor.
    preview = mountPreview("- [ ] todo\n", 5);
    const moved = preview.view.moveByChar(preview.view.state.selection.main, false);
    expect(moved.head).toBe(2);
  });

  it("does not strand the cursor inside a revealed marker", () => {
    // Block markers reveal as soon as the cursor reaches their line, so
    // stepping back from the heading text lands on real, visible characters.
    preview = mountPreview("body\n\n## hi", 9);
    const moved = preview.view.moveByChar(preview.view.state.selection.main, false);
    expect(preview.lineText(3)).toBe("## hi");
    expect(moved.head).toBe(8);
  });
});
