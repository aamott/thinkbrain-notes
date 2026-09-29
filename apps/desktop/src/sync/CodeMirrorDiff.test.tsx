// @vitest-environment happy-dom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CodeMirrorDiff, type CodeMirrorDiffProps } from "./CodeMirrorDiff";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
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

describe("CodeMirrorDiff", () => {
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
