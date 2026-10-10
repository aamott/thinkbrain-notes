import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { markdownFormat, type MarkdownFormatAction } from "./markdownFormat";

const apply = (
  doc: string,
  selection: { anchor: number; head?: number },
  action: MarkdownFormatAction
): { doc: string; anchor: number; head: number } => {
  const state = EditorState.create({
    doc,
    selection: { anchor: selection.anchor, head: selection.head ?? selection.anchor }
  });
  const next = state.update(markdownFormat(state, action)).state;
  return {
    doc: next.doc.toString(),
    anchor: next.selection.main.anchor,
    head: next.selection.main.head
  };
};

const applyAll = (doc: string, action: MarkdownFormatAction) =>
  apply(doc, { anchor: 0, head: doc.length }, action);

describe("inline markers", () => {
  it("wraps a selection and keeps the text selected", () => {
    const out = apply("say world", { anchor: 4, head: 9 }, "bold");
    expect(out.doc).toBe("say **world**");
    expect(out.head - out.anchor).toBe(5);
    expect(out.doc.slice(out.anchor, out.head)).toBe("world");
  });

  it("unwraps markers immediately around the selection", () => {
    const out = apply("say **world**", { anchor: 6, head: 11 }, "bold");
    expect(out.doc).toBe("say world");
    expect(out.doc.slice(out.anchor, out.head)).toBe("world");
  });

  it("unwraps markers inside the selection itself", () => {
    const out = apply("say **world**", { anchor: 4, head: 13 }, "bold");
    expect(out.doc).toBe("say world");
  });

  it("drops a marker pair around an empty selection", () => {
    const out = apply("say ", { anchor: 4 }, "bold");
    expect(out.doc).toBe("say ****");
    expect(out.anchor).toBe(6);
  });

  it("wraps with *, ~~ and ` for italic, strikethrough and code", () => {
    expect(apply("x", { anchor: 0, head: 1 }, "italic").doc).toBe("*x*");
    expect(apply("x", { anchor: 0, head: 1 }, "strikethrough").doc).toBe("~~x~~");
    expect(apply("x", { anchor: 0, head: 1 }, "code").doc).toBe("`x`");
    expect(apply("*x*", { anchor: 1, head: 2 }, "italic").doc).toBe("x");
  });
});

describe("line prefixes", () => {
  it("bullets every line the selection touches, and toggles back off", () => {
    const on = applyAll("one\ntwo\nthree", "bullet-list");
    expect(on.doc).toBe("- one\n- two\n- three");
    const off = applyAll(on.doc, "bullet-list");
    expect(off.doc).toBe("one\ntwo\nthree");
  });

  it("numbers and tasks lines, preserving indentation", () => {
    expect(applyAll("one\ntwo", "numbered-list").doc).toBe("1. one\n1. two");
    expect(applyAll("  indented", "task-list").doc).toBe("  - [ ] indented");
    expect(applyAll("  - [ ] indented", "task-list").doc).toBe("  indented");
  });

  it("swaps an existing marker for the new one — bullet to numbered", () => {
    expect(applyAll("- one\n- two", "numbered-list").doc).toBe("1. one\n1. two");
    expect(applyAll("- [ ] one", "bullet-list").doc).toBe("- one");
  });

  it("quotes every line and unquotes one level", () => {
    const on = applyAll("one\ntwo", "quote");
    expect(on.doc).toBe("> one\n> two");
    expect(applyAll(on.doc, "quote").doc).toBe("one\ntwo");
  });

  it("only toggles off when every non-empty touched line has the prefix", () => {
    const out = applyAll("- one\ntwo", "bullet-list");
    expect(out.doc).toBe("- one\n- two");
  });
});

describe("heading", () => {
  it("cycles none → # → ## → ### → none", () => {
    let doc = "title";
    for (const expected of ["# title", "## title", "### title", "title"]) {
      doc = apply(doc, { anchor: 0 }, "heading").doc;
      expect(doc).toBe(expected);
    }
  });

  it("replaces an existing prefix rather than stacking", () => {
    expect(apply("## mid", { anchor: 0 }, "heading").doc).toBe("### mid");
    // A level deeper than the cycle's ### resets to none.
    expect(apply("##### deep", { anchor: 0 }, "heading").doc).toBe("deep");
    expect(applyAll("one\ntwo", "heading").doc).toBe("# one\n# two");
  });
});

describe("link", () => {
  it("wraps the selection and selects the url placeholder", () => {
    const out = apply("see docs", { anchor: 4, head: 8 }, "link");
    expect(out.doc).toBe("see [docs](url)");
    expect(out.doc.slice(out.anchor, out.head)).toBe("url");
  });

  it("inserts an empty link with the cursor in the text brackets", () => {
    const out = apply("x", { anchor: 1 }, "link");
    expect(out.doc).toBe("x[](url)");
    expect(out.anchor).toBe(2);
  });
});

describe("multi-cursor", () => {
  it("formats every range at once", () => {
    const base = EditorState.create({
      doc: "one two",
      extensions: EditorState.allowMultipleSelections.of(true)
    });
    const state = base.update({
      selection: EditorSelection.create([
        EditorSelection.range(0, 3),
        EditorSelection.range(4, 7)
      ])
    }).state;
    const next = state.update(markdownFormat(state, "bold")).state;
    expect(next.doc.toString()).toBe("**one** **two**");
    expect(next.selection.ranges).toHaveLength(2);
  });

  it("tags the edit as user input and scrolls the caret into view", () => {
    const state = EditorState.create({ doc: "x", selection: { anchor: 0, head: 1 } });
    const spec = markdownFormat(state, "bold");
    expect(spec.userEvent).toBe("input.format");
    expect(spec.scrollIntoView).toBe(true);
  });
});
