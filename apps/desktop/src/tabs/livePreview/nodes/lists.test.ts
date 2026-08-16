// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import { mountPreview, type PreviewHandle } from "../harness";

let preview: PreviewHandle | null = null;

afterEach(() => {
  preview?.destroy();
  preview = null;
});

const checkbox = (handle: PreviewHandle): HTMLInputElement => {
  const element = handle.view.dom.querySelector(".cm-task-checkbox");
  if (!(element instanceof HTMLInputElement)) throw new Error("no checkbox rendered");
  return element;
};

describe("list live preview", () => {
  it("keeps bullet markers visible because they carry meaning", () => {
    preview = mountPreview("- one\n- two\n", 0);
    expect(preview.lineText(1)).toBe("- one");
  });

  it("styles the bullet marker", () => {
    preview = mountPreview("- one\n- two\n", 0);
    expect(preview.view.dom.querySelector(".cm-list-mark")).not.toBeNull();
  });

  it("keeps ordered list numbers visible", () => {
    preview = mountPreview("1. one\n2. two\n", 0);
    expect(preview.lineText(1)).toBe("1. one");
  });
});

describe("task checkbox live preview", () => {
  it("renders an unchecked checkbox for an open task", () => {
    preview = mountPreview("- [ ] todo\n", 0);
    expect(checkbox(preview).checked).toBe(false);
  });

  it("renders a checked checkbox for a done task", () => {
    preview = mountPreview("- [x] done\n", 0);
    expect(checkbox(preview).checked).toBe(true);
  });

  it("writes the document when the checkbox is clicked", () => {
    preview = mountPreview("- [ ] todo\n", 0);
    checkbox(preview).click();
    expect(preview.view.state.doc.toString()).toBe("- [x] todo\n");
  });

  it("unchecks a done task when clicked", () => {
    preview = mountPreview("- [x] done\n", 0);
    checkbox(preview).click();
    expect(preview.view.state.doc.toString()).toBe("- [ ] done\n");
  });
});
