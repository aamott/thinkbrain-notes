// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { undoDepth } from "@codemirror/commands";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CodeEditor } from "./CodeEditor";
import {
  displaySettingsExtension,
  EDITOR_FONT_SIZE_KEY,
  resolveEditorFontSize,
  resolveEditorLineWrapping
} from "./editorDisplaySettings";
import { releaseEditorStatesExcept } from "./editorStateCache";
import { MarkdownEditor } from "./MarkdownEditor";
import { seedSettingsStore, flushPromises } from "../settings/settingsTestHelpers";
import { useSettingsStore } from "../settings/settingsStore";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const mount = async (element: React.ReactElement): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(element);
  });
  return container;
};

/**
 * `EditorView.theme` compiles `&` rules into an injected stylesheet class on
 * `.cm-editor`; happy-dom's getComputedStyle reflects the injected sheet, so
 * the computed font size is the honest observable.
 */
const appliedEditorFontSize = (): string =>
  getComputedStyle(document.querySelector<HTMLElement>(".cm-editor")!).fontSize;

const liveView = (host: HTMLElement): EditorView => {
  const section = host.querySelector("section > div");
  return EditorView.findFromDOM(section as HTMLElement)!;
};

beforeEach(() => {
  seedSettingsStore();
});

afterEach(async () => {
  releaseEditorStatesExcept(new Set());
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("resolveEditorFontSize / resolveEditorLineWrapping", () => {
  it("falls back to 16 for invalid values and clamps the 10–32 band", () => {
    expect(resolveEditorFontSize(undefined)).toBe(16);
    expect(resolveEditorFontSize("abc")).toBe(16);
    expect(resolveEditorFontSize(null)).toBe(16);
    // The preference is numeric-only — strings (even empty or numeric
    // ones) must never collapse to the 10px floor via Number().
    expect(resolveEditorFontSize("")).toBe(16);
    expect(resolveEditorFontSize(" ")).toBe(16);
    expect(resolveEditorFontSize("24")).toBe(16);
    expect(resolveEditorFontSize(Number.NaN)).toBe(16);
    expect(resolveEditorFontSize(4)).toBe(10);
    expect(resolveEditorFontSize(99)).toBe(32);
    expect(resolveEditorFontSize(20.6)).toBe(21);
  });

  it("wraps on anything but explicit false", () => {
    expect(resolveEditorLineWrapping(undefined)).toBe(true);
    expect(resolveEditorLineWrapping(true)).toBe(true);
    expect(resolveEditorLineWrapping(false)).toBe(false);
  });

  it("builds a themed extension with absolute px font size", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const view = new EditorView({
      parent: host,
      state: EditorState.create({ doc: "x", extensions: displaySettingsExtension(22, false) })
    });
    expect(appliedEditorFontSize()).toBe("22px");
    expect(view.contentDOM.classList.contains("cm-lineWrapping")).toBe(false);
    view.destroy();
    host.remove();
  });
});

describe("editor display settings wiring", () => {
  it("MarkdownEditor renders at the effective font size", async () => {
    await mount(<MarkdownEditor value="hi" onChange={() => {}} onSave={() => {}} />);
    expect(appliedEditorFontSize()).toBe("16px");
  });

  it("staged and persisted preferences win over the default; invalid values fall back", async () => {
    seedSettingsStore({
      appValues: { "editor.fontSize": "garbage", "editor.lineWrapping": true }
    });
    await mount(<MarkdownEditor value="hi" onChange={() => {}} onSave={() => {}} />);
    expect(appliedEditorFontSize()).toBe("16px");

    await act(async () => {
      useSettingsStore.getState().stageChange(EDITOR_FONT_SIZE_KEY, 24);
    });
    expect(appliedEditorFontSize()).toBe("24px");
  });

  it("reconfigures in place: same view, doc, selection and undo survive", async () => {
    const host = await mount(
      <MarkdownEditor value="hello world" onChange={() => {}} onSave={() => {}} />
    );
    const viewBefore = liveView(host);
    viewBefore.dispatch({
      changes: { from: 0, insert: "EDIT " },
      selection: { anchor: 3 }
    });
    const docBefore = viewBefore.state.doc.toString();

    await act(async () => {
      useSettingsStore.getState().stageChange(EDITOR_FONT_SIZE_KEY, 28);
    });
    await flushPromises();

    const viewAfter = liveView(host);
    expect(viewAfter).toBe(viewBefore);
    expect(viewAfter.state.doc.toString()).toBe(docBefore);
    expect(viewAfter.state.selection.main.head).toBe(3);
    expect(undoDepth(viewAfter.state)).toBeGreaterThan(0);
    expect(appliedEditorFontSize()).toBe("28px");
  });

  it("the interface scale does not size editor text", async () => {
    await mount(<MarkdownEditor value="hi" onChange={() => {}} onSave={() => {}} />);
    await act(async () => {
      useSettingsStore.getState().stageChange("ui.scale", 150);
    });
    expect(appliedEditorFontSize()).toBe("16px");
  });

  it("editor.lineWrapping=false removes cm-lineWrapping so code can overflow", async () => {
    seedSettingsStore({ appValues: { "editor.lineWrapping": false } });
    const host = await mount(
      <CodeEditor value={"const x = 1;"} onChange={() => {}} onSave={() => {}} />
    );
    expect(liveView(host).contentDOM.classList.contains("cm-lineWrapping")).toBe(false);
  });

  it("wraps by default in the code editor too", async () => {
    const host = await mount(
      <CodeEditor value={"const x = 1;"} onChange={() => {}} onSave={() => {}} />
    );
    expect(liveView(host).contentDOM.classList.contains("cm-lineWrapping")).toBe(true);
  });

});
