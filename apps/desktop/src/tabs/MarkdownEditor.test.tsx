// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MarkdownEditor } from "./MarkdownEditor";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
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
