// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import { mountPreview, type PreviewHandle } from "./harness";

let preview: PreviewHandle | null = null;

afterEach(() => {
  preview?.destroy();
  preview = null;
});

describe("wiki link live preview", () => {
  it("shows only the target when the cursor is elsewhere", () => {
    preview = mountPreview("see [[My Note]] now", 0);
    expect(preview.lineText(1)).toBe("see My Note now");
  });

  it("shows the alias rather than the target when one is given", () => {
    preview = mountPreview("see [[My Note|the note]] now", 0);
    expect(preview.lineText(1)).toBe("see the note now");
  });

  it("reveals the full source when the cursor is inside", () => {
    preview = mountPreview("see [[My Note]] now", 8);
    expect(preview.lineText(1)).toBe("see [[My Note]] now");
  });

  it("styles the visible text as a link", () => {
    preview = mountPreview("see [[My Note]] now", 0);
    expect(preview.view.dom.querySelector(".cm-link-text")).not.toBeNull();
  });

  it("leaves an unterminated wiki link alone", () => {
    preview = mountPreview("see [[My Note now", 0);
    expect(preview.lineText(1)).toBe("see [[My Note now");
  });

  it("never alters the document", () => {
    preview = mountPreview("see [[My Note|the note]] now", 0);
    expect(preview.view.state.doc.toString()).toBe("see [[My Note|the note]] now");
  });
});
