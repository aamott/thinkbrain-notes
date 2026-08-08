// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  desktopEditorHeaderRegistry,
  type EditorHeaderContext
} from "./editorHeaderRegistry";
import { MarkdownEditor } from "./MarkdownEditor";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const mount = async (element: React.ReactElement): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(element);
  });
  return container;
};

describe("MarkdownEditor live preview", () => {
  it("renders markdown formatted when live preview is enabled", async () => {
    // The cursor defaults to offset 0, which is not on the heading line, so
    // the heading must render without its `##`.
    const host = await mount(
      <MarkdownEditor value={"body\n\n## hi"} onChange={() => {}} onSave={() => {}} />
    );
    const lines = host.querySelectorAll(".cm-line");
    expect(lines[2]?.textContent).toBe("hi");
    expect(lines[2]?.className).toContain("cm-h2");
  });

  it("shows raw source when live preview is disabled", async () => {
    const host = await mount(
      <MarkdownEditor
        value={"body\n\n## hi"}
        livePreview={false}
        onChange={() => {}}
        onSave={() => {}}
      />
    );
    const lines = host.querySelectorAll(".cm-line");
    expect(lines[2]?.textContent).toBe("## hi");
    expect(lines[2]?.className).not.toContain("cm-h2");
  });

  it("swaps modes in place without losing the document", async () => {
    const host = await mount(
      <MarkdownEditor value={"body\n\n## hi"} onChange={() => {}} onSave={() => {}} />
    );
    expect(host.querySelectorAll(".cm-line")[2]?.textContent).toBe("hi");

    await act(async () => {
      root?.render(
        <MarkdownEditor
          value={"body\n\n## hi"}
          livePreview={false}
          onChange={() => {}}
          onSave={() => {}}
        />
      );
    });

    expect(host.querySelectorAll(".cm-line")[2]?.textContent).toBe("## hi");
  });
});

describe("MarkdownEditor", () => {
  it("creates, updates, and destroys its controlled CodeMirror view", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const onChange = vi.fn<(value: string) => void>();
    const onSave = vi.fn<() => void>();

    await act(async () => {
      root?.render(
        <MarkdownEditor value="# Initial" onChange={onChange} onSave={onSave} />
      );
    });

    const content = container.querySelector<HTMLElement>(".cm-content");
    expect(content).not.toBeNull();
    expect(content?.getAttribute("aria-label")).toBe("Markdown editor");
    expect(content?.textContent).toContain("# Initial");

    await act(async () => {
      root?.render(
        <MarkdownEditor value="# Updated" onChange={onChange} onSave={onSave} />
      );
    });

    expect(content?.textContent).toContain("# Updated");
    container.querySelector<HTMLButtonElement>("button")?.click();
    expect(onSave).toHaveBeenCalledOnce();

    await act(async () => root?.unmount());
    expect(container.querySelector(".cm-editor")).toBeNull();
    root = null;
  });
});

describe("MarkdownEditor header slot", () => {
  const header = (id: string) => ({
    id,
    label: "Entry metadata",
    render: ({ relativePath }: EditorHeaderContext) => <p>header for {relativePath}</p>
  });

  it("renders a contributed header above the editor body", async () => {
    const handle = desktopEditorHeaderRegistry.register(header("above-body"));
    try {
      const host = await mount(
        <MarkdownEditor
          value="body"
          relativePath="journal/2026/08/2026-08-07-1802.md"
          onChange={() => {}}
          onSave={() => {}}
        />
      );

      const region = host.querySelector('[data-editor-header="above-body"]');
      expect(region?.textContent).toBe("header for journal/2026/08/2026-08-07-1802.md");
      // Above the text, not inside CodeMirror's DOM.
      expect(region?.compareDocumentPosition(host.querySelector(".cm-editor")!)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING
      );
    } finally {
      handle.dispose();
    }
  });

  it("shows a header registered after the editor mounted, without rebuilding it", async () => {
    // A lazily activated extension must reach editors that are already open,
    // and doing so must not cost the user their cursor or undo history.
    const host = await mount(
      <MarkdownEditor value="body" relativePath="note.md" onChange={() => {}} onSave={() => {}} />
    );
    const editorBefore = host.querySelector(".cm-editor");

    const handle = desktopEditorHeaderRegistry.register(header("late"));
    try {
      await act(async () => {});

      expect(host.querySelector('[data-editor-header="late"]')).not.toBeNull();
      expect(host.querySelector(".cm-editor")).toBe(editorBefore);
    } finally {
      handle.dispose();
    }
  });

  it("removes a disposed header without disturbing the document", async () => {
    const host = await mount(
      <MarkdownEditor value="body" relativePath="note.md" onChange={() => {}} onSave={() => {}} />
    );
    const handle = desktopEditorHeaderRegistry.register(header("temporary"));
    await act(async () => {});
    const editorBefore = host.querySelector(".cm-editor");

    await act(async () => handle.dispose());

    expect(host.querySelector('[data-editor-header="temporary"]')).toBeNull();
    expect(host.querySelector(".cm-editor")).toBe(editorBefore);
    expect(host.querySelector(".cm-content")?.textContent).toContain("body");
  });
});
