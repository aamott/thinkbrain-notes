// @vitest-environment happy-dom
import { deleteCharBackward, deleteGroupBackward, deleteLine } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { parseFrontmatter } from "@thinkbrain/core";
import { afterEach, describe, expect, it } from "vitest";

import { frontmatterGuard } from "./frontmatterGuard";

/**
 * Holding Backspace at the top of a journal entry must not eat the frontmatter
 * live preview has hidden. Commands are dispatched through a real EditorView
 * so the transactions carry the same `delete` user events the keymap produces.
 */

const NOTE = "---\ndate: 2026-08-08\nmood: happy\n---\n\nBread needed more salt.\n";
const FRONTMATTER = "---\ndate: 2026-08-08\nmood: happy\n---\n";

let view: EditorView | null = null;

function mount(source: string, anchor = source.length): EditorView {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  view = new EditorView({
    parent,
    state: EditorState.create({
      doc: source,
      selection: { anchor },
      extensions: [frontmatterGuard()]
    })
  });
  return view;
}

afterEach(() => {
  view?.destroy();
  view?.dom.parentElement?.remove();
  view = null;
});

describe("frontmatterGuard", () => {
  it("stops held Backspace at the body from eating the frontmatter", () => {
    const editor = mount(NOTE);
    for (let i = 0; i < 100; i++) deleteCharBackward(editor);

    expect(editor.state.doc.toString()).toBe(FRONTMATTER);
    const parsed = parseFrontmatter(editor.state.doc.toString());
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.metadata["date"]).toBe("2026-08-08");
    expect(parsed.metadata["mood"]).toBe("happy");
  });

  it("stops held Ctrl+Backspace the same way", () => {
    const editor = mount(NOTE);
    for (let i = 0; i < 100; i++) deleteGroupBackward(editor);

    expect(editor.state.doc.toString()).toBe(FRONTMATTER);
    expect(parseFrontmatter(editor.state.doc.toString()).diagnostics).toEqual([]);
  });

  it("keeps the frontmatter intact under repeated deleteLine", () => {
    const editor = mount(NOTE);
    for (let i = 0; i < 20; i++) deleteLine(editor);

    expect(editor.state.doc.toString().startsWith(FRONTMATTER)).toBe(true);
    expect(parseFrontmatter(editor.state.doc.toString()).diagnostics).toEqual([]);
  });

  it("still deletes when the cursor is inside the frontmatter", () => {
    const cursor = NOTE.indexOf("happy") + "happy".length;
    const editor = mount(NOTE, cursor);

    expect(deleteCharBackward(editor)).toBe(true);
    expect(editor.state.doc.toString()).toBe(NOTE.replace("mood: happy", "mood: happ"));
  });

  it("lets a select-all delete the whole document", () => {
    const editor = mount(NOTE);
    editor.dispatch({ selection: { anchor: 0, head: editor.state.doc.length } });

    deleteCharBackward(editor);
    expect(editor.state.doc.toString()).toBe("");
  });

  it("leaves typing at the body start alone", () => {
    const bodyStart = FRONTMATTER.length + 1;
    const editor = mount(NOTE, bodyStart);

    editor.dispatch({
      changes: { from: bodyStart, insert: "More " },
      selection: { anchor: bodyStart + 5 },
      userEvent: "input.type"
    });
    expect(editor.state.doc.toString()).toBe(NOTE.replace("\nBread", "\nMore Bread"));
  });

  it("lets Backspace work normally in a note without frontmatter", () => {
    const editor = mount("Bread needed more salt.\n");

    deleteCharBackward(editor);
    expect(editor.state.doc.toString()).toBe("Bread needed more salt.");
  });
});
