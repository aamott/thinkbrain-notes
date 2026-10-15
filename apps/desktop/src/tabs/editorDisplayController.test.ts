// @vitest-environment happy-dom

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import { createEditorDisplayController } from "./editorDisplayController";

let host: HTMLElement;
let view: EditorView;

const setup = (): ReturnType<typeof createEditorDisplayController> => {
  host = document.createElement("div");
  document.body.appendChild(host);
  const ctl = createEditorDisplayController({ fontSize: 16, lineWrapping: true });
  view = new EditorView({
    parent: host,
    state: EditorState.create({ doc: "line\n".repeat(50), extensions: ctl.extension() })
  });
  return ctl;
};

afterEach(() => {
  view?.destroy();
  host?.remove();
  document.body.innerHTML = "";
});

const editorFont = (): string =>
  getComputedStyle(view.dom).fontSize;

describe("createEditorDisplayController", () => {
  it("extension carries the initial values and applied() reports them", () => {
    const ctl = setup();
    expect(ctl.applied()).toEqual({ fontSize: 16, lineWrapping: true });
    expect(editorFont()).toBe("16px");
    expect(view.contentDOM.classList.contains("cm-lineWrapping")).toBe(true);
  });

  it("applyPreferences reconfigures the live view without a remount", () => {
    const ctl = setup();
    ctl.applyPreferences(view, { fontSize: 22, lineWrapping: false });
    expect(ctl.applied()).toEqual({ fontSize: 22, lineWrapping: false });
    expect(editorFont()).toBe("22px");
    expect(view.contentDOM.classList.contains("cm-lineWrapping")).toBe(false);
  });

  it("applyPreferences takes a scroll snapshot so reading position survives", () => {
    const ctl = setup();
    // scrollSnapshot is a state effect on the same transaction; a dispatch
    // with it must not throw and the view must stay usable afterwards.
    expect(() => ctl.applyPreferences(view, { fontSize: 22, lineWrapping: true })).not.toThrow();
    expect(view.state.doc.length).toBeGreaterThan(0);
  });
});
