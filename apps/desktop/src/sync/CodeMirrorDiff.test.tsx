// @vitest-environment happy-dom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CodeMirrorDiff, type CodeMirrorDiffProps } from "./CodeMirrorDiff";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

// A ResizeObserver the test drives by hand: happy-dom has none, so the
// component would otherwise take its one-shot window-width fallback.
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  fire(width: number): void {
    this.callback(
      [{ contentRect: { width } } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver
    );
  }
}

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  FakeResizeObserver.instances = [];
  vi.unstubAllGlobals();
  // The theme tests write the real document attribute — never leak it.
  delete document.documentElement.dataset.thinkbrainTheme;
});

const render = async (props: Partial<CodeMirrorDiffProps> = {}): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <CodeMirrorDiff
        before={"shared\nincoming\n"}
        after={"shared\nlocal\n"}
        beforeLabel="OneDrive"
        afterLabel="This computer"
        relativePath="note.md"
        ariaLabel="Compare the versions"
        {...props}
      />
    )
  );
  return container;
};

/** Sizes the container through the mocked observer, inside act. */
const resizeTo = async (width: number): Promise<void> => {
  await act(async () => {
    // Instance 0 is the component's own observer — it is created before the
    // editors mount, and the engines have ResizeObservers of their own.
    FakeResizeObserver.instances[0]?.fire(width);
  });
};

const button = (host: HTMLElement, text: string): HTMLButtonElement => {
  const found = [...host.querySelectorAll("button")].find(
    (candidate): candidate is HTMLButtonElement => candidate.textContent?.trim() === text
  );
  if (!found) throw new Error(`No button reading "${text}" among: ${host.textContent}`);
  return found;
};

/** The real editor inside a merge pane's wrapper element. */
const editorIn = (pane: Element): EditorView => {
  const view = EditorView.findFromDOM(
    (pane.querySelector(".cm-editor") ?? pane) as HTMLElement
  );
  if (!view) throw new Error("No CodeMirror editor inside the pane");
  return view;
};

const panes = (host: HTMLElement): [EditorView, EditorView] => {
  const views = [...host.querySelectorAll(".cm-mergeViewEditor")].map(editorIn);
  if (views.length !== 2) {
    throw new Error(`Expected two merge panes, found ${views.length}`);
  }
  return [views[0]!, views[1]!];
};

/** The single editor the inline presentation mounts. */
const inlineEditor = (host: HTMLElement): EditorView => {
  const editors = host.querySelectorAll(".cm-editor");
  if (editors.length !== 1) throw new Error(`Expected one editor, found ${editors.length}`);
  const view = EditorView.findFromDOM(editors[0] as HTMLElement);
  if (!view) throw new Error("No CodeMirror editor mounted");
  return view;
};

describe("CodeMirrorDiff in the split presentation", () => {
  it("mounts a two-pane merge view with both versions and their names", async () => {
    const host = await render();

    expect(host.querySelector(".cm-mergeView")).not.toBeNull();
    expect(host.querySelectorAll(".cm-mergeViewEditor")).toHaveLength(2);
    expect(host.textContent).toContain("OneDrive");
    expect(host.textContent).toContain("This computer");

    const [left, right] = panes(host);
    expect(left.state.doc.toString()).toBe("shared\nincoming\n");
    expect(right.state.doc.toString()).toBe("shared\nlocal\n");
  });

  it("keeps the left version read-only while the right stays editable", async () => {
    const host = await render();
    const [left, right] = panes(host);

    expect(left.state.facet(EditorState.readOnly)).toBe(true);
    expect(left.state.facet(EditorView.editable)).toBe(false);
    expect(right.state.facet(EditorState.readOnly)).toBe(false);
    expect(right.state.facet(EditorView.editable)).toBe(true);
  });

  it("can mark the right pane read-only too", async () => {
    const host = await render({ editableAfter: false });
    const [, right] = panes(host);

    expect(right.state.facet(EditorState.readOnly)).toBe(true);
    expect(right.state.facet(EditorView.editable)).toBe(false);
  });

  it("reports real edits to the right pane through onAfterChange", async () => {
    const onAfterChange = vi.fn();
    const host = await render({ onAfterChange });
    const [, right] = panes(host);

    await act(async () => {
      right.dispatch({ changes: { from: 7, to: 12, insert: "typed by hand" } });
    });

    expect(onAfterChange).toHaveBeenCalledWith("shared\ntyped by hand\n");
  });

  it("shows the transfer strip between the panes only when asked", async () => {
    const host = await render({ transferBeforeToAfter: true });
    expect(host.querySelector(".cm-merge-revert")).not.toBeNull();

    await act(async () => root?.unmount());
    container?.remove();

    const without = await render();
    expect(without.querySelector(".cm-merge-revert")).toBeNull();
  });

  it("re-themes both panes when the app theme switches", async () => {
    document.documentElement.dataset.thinkbrainTheme = "light";
    const host = await render();
    const [left, right] = panes(host);
    expect(left.state.facet(EditorView.darkTheme)).toBe(false);
    expect(right.state.facet(EditorView.darkTheme)).toBe(false);

    await act(async () => {
      document.documentElement.dataset.thinkbrainTheme = "dark";
      // MutationObserver delivers on a microtask.
      await Promise.resolve();
    });

    expect(left.state.facet(EditorView.darkTheme)).toBe(true);
    expect(right.state.facet(EditorView.darkTheme)).toBe(true);
  });

  it("tears the merge view down when it unmounts", async () => {
    const host = await render();

    await act(async () => root?.unmount());
    root = null;

    expect(host.querySelector(".cm-mergeView")).toBeNull();
  });
});

describe("the responsive layout default", () => {
  it("shows the inline presentation below 720px of container width", async () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const host = await render();
    await resizeTo(719);

    expect(host.querySelectorAll(".cm-editor")).toHaveLength(1);
    expect(host.querySelector(".cm-mergeView")).toBeNull();
    // unifiedMergeView's own decoration marks the changed lines.
    expect(host.querySelector(".cm-changedLine")).not.toBeNull();
    // The synthesized "X compared with Y" sentence is gone — callers name
    // the comparison themselves through labels and aria.
    expect(host.textContent).not.toContain("compared with");
    expect(inlineEditor(host).state.doc.toString()).toBe("shared\nlocal\n");
  });

  it("shows the split presentation at 720px of container width", async () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const host = await render();
    await resizeTo(720);

    expect(host.querySelectorAll(".cm-mergeViewEditor")).toHaveLength(2);
  });
});

describe("the layout switch", () => {
  it("switches both directions and reflects the choice in aria-pressed", async () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const host = await render();
    await resizeTo(900);

    expect(button(host, "Side by side").getAttribute("aria-pressed")).toBe("true");
    expect(button(host, "Inline").getAttribute("aria-pressed")).toBe("false");
    expect(host.querySelector('[role="group"][aria-label="Diff layout"]')).not.toBeNull();

    await act(async () => button(host, "Inline").click());
    expect(host.querySelectorAll(".cm-editor")).toHaveLength(1);
    expect(button(host, "Inline").getAttribute("aria-pressed")).toBe("true");

    await act(async () => button(host, "Side by side").click());
    expect(host.querySelectorAll(".cm-mergeViewEditor")).toHaveLength(2);
    expect(button(host, "Side by side").getAttribute("aria-pressed")).toBe("true");
  });

  /// The working document belongs to the user, not to whichever engine is
  /// mounted — a layout change hands the live text across rather than
  /// re-seeding from the prop.
  it("keeps edits to the result across a switch", async () => {
    const onAfterChange = vi.fn();
    const host = await render({ onAfterChange });
    const [, right] = panes(host);

    await act(async () => {
      right.dispatch({ changes: { from: 7, to: 12, insert: "typed by hand" } });
    });
    expect(onAfterChange).toHaveBeenCalledWith("shared\ntyped by hand\n");

    await act(async () => button(host, "Inline").click());
    expect(inlineEditor(host).state.doc.toString()).toBe("shared\ntyped by hand\n");

    await act(async () => button(host, "Side by side").click());
    expect(panes(host)[1].state.doc.toString()).toBe("shared\ntyped by hand\n");
  });

  it("follows the container until the user picks a layout, then not again", async () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const host = await render();
    await resizeTo(500);
    expect(host.querySelectorAll(".cm-editor")).toHaveLength(1);

    await act(async () => button(host, "Side by side").click());
    await resizeTo(900);
    expect(host.querySelectorAll(".cm-mergeViewEditor")).toHaveLength(2);
  });
});

describe("the inline presentation's merge controls", () => {
  const renderInline = async (props: Partial<CodeMirrorDiffProps> = {}): Promise<HTMLDivElement> => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const host = await render(props);
    await resizeTo(500);
    return host;
  };

  it("offers per-chunk actions named for what they do", async () => {
    const host = await renderInline({ transferBeforeToAfter: true });

    const controls = host.querySelector(".cm-chunkButtons");
    expect(controls).not.toBeNull();
    expect([...controls!.querySelectorAll("button")].map((b) => b.textContent)).toEqual([
      "Keep current",
      "Use incoming"
    ]);
  });

  /// "Reject" is the package's word; on this surface it means putting the
  /// incoming text back.
  it("restores the incoming text through Use incoming and reports the result", async () => {
    const onAfterChange = vi.fn();
    const host = await renderInline({ transferBeforeToAfter: true, onAfterChange });

    await act(async () => {
      button(host.querySelector(".cm-chunkButtons") as HTMLElement, "Use incoming").dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true })
      );
    });

    expect(inlineEditor(host).state.doc.toString()).toBe("shared\nincoming\n");
    expect(onAfterChange).toHaveBeenCalledWith("shared\nincoming\n");
  });

  /// The caller decides which document is which; the engine must then show
  /// a current-only stretch as deleted and a restore-only stretch as the
  /// document's own text — this is the semantics the restore preview relies on.
  it("shows text only in the original as deleted and keeps B's own text", async () => {
    const host = await renderInline({
      before: "shared\nCURRENT-ONLY\n",
      after: "shared\nRECORDED-ONLY\n"
    });

    // allowInlineDiffs shows the A-only stretch inline as struck text.
    expect(host.querySelector(".cm-deletedText")?.textContent).toContain("CURRENT");
    const view = inlineEditor(host);
    expect(view.state.doc.toString()).toBe("shared\nRECORDED-ONLY\n");
    expect(
      view.dom.querySelector(".cm-inlineChangedLine, .cm-changedLine")?.textContent
    ).toContain("RECORDED-ONLY");
  });

  it("mounts no merge controls when the comparison is read-only", async () => {
    const host = await renderInline({ editableAfter: false, transferBeforeToAfter: true });

    expect(host.querySelector(".cm-chunkButtons")).toBeNull();
    const view = inlineEditor(host);
    expect(view.state.facet(EditorState.readOnly)).toBe(true);
    expect(view.state.facet(EditorView.editable)).toBe(false);
  });
});
