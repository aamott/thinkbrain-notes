// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NoteIndexEntry } from "@thinkbrain/core";

import { mountPreview, type PreviewHandle } from "./harness";

let preview: PreviewHandle | null = null;

afterEach(() => {
  preview?.destroy();
  preview = null;
});

const NOTE_INDEX: readonly NoteIndexEntry[] = [
  {
    relativePath: "My Note.md",
    fileName: "My Note.md",
    title: undefined,
    aliases: []
  },
  {
    relativePath: "folder/Other.md",
    fileName: "Other.md",
    title: "Other Title",
    aliases: ["alias-note"]
  }
];

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

describe("wiki link resolution styling", () => {
  it("adds cm-link-resolved when the target matches a note", () => {
    preview = mountPreview("see [[My Note]] now", 0, { noteIndex: NOTE_INDEX });
    expect(preview.view.dom.querySelector(".cm-link-resolved")).not.toBeNull();
    expect(preview.view.dom.querySelector(".cm-link-broken")).toBeNull();
  });

  it("adds cm-link-broken when the target does not match any note", () => {
    preview = mountPreview("see [[Nonexistent]] now", 0, { noteIndex: NOTE_INDEX });
    expect(preview.view.dom.querySelector(".cm-link-broken")).not.toBeNull();
    expect(preview.view.dom.querySelector(".cm-link-resolved")).toBeNull();
  });

  it("adds cm-link-broken when no noteIndex is provided", () => {
    preview = mountPreview("see [[My Note]] now", 0);
    expect(preview.view.dom.querySelector(".cm-link-broken")).not.toBeNull();
    expect(preview.view.dom.querySelector(".cm-link-resolved")).toBeNull();
  });

  it("resolves a link by alias", () => {
    preview = mountPreview("see [[alias-note]] now", 0, { noteIndex: NOTE_INDEX });
    expect(preview.view.dom.querySelector(".cm-link-resolved")).not.toBeNull();
  });

  it("resolves a link by title", () => {
    preview = mountPreview("see [[Other Title]] now", 0, { noteIndex: NOTE_INDEX });
    expect(preview.view.dom.querySelector(".cm-link-resolved")).not.toBeNull();
  });

  it("marks a resolved link with alias display text", () => {
    preview = mountPreview("see [[My Note|display]] now", 0, { noteIndex: NOTE_INDEX });
    expect(preview.view.dom.querySelector(".cm-link-resolved")).not.toBeNull();
    expect(preview.lineText(1)).toBe("see display now");
  });
});

describe("wiki link click navigation", () => {
  it("calls onOpenNote when a resolved wiki link is clicked", () => {
    const onOpenNote = vi.fn();
    preview = mountPreview("see [[My Note]] now", 0, {
      noteIndex: NOTE_INDEX,
      onOpenNote
    });
    const linkEl = preview.view.dom.querySelector(".cm-link-resolved") as HTMLElement;
    expect(linkEl).not.toBeNull();
    linkEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onOpenNote).toHaveBeenCalledTimes(1);
    expect(onOpenNote).toHaveBeenCalledWith("My Note.md");
  });

  it("does not call onOpenNote when an unresolved wiki link is clicked", () => {
    const onOpenNote = vi.fn();
    preview = mountPreview("see [[Nonexistent]] now", 0, {
      noteIndex: NOTE_INDEX,
      onOpenNote
    });
    const linkEl = preview.view.dom.querySelector(".cm-link-broken") as HTMLElement;
    expect(linkEl).not.toBeNull();
    linkEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onOpenNote).not.toHaveBeenCalled();
  });

  it("does not call onOpenNote when no callback is provided", () => {
    // Even with a resolved link, no callback means no navigation.
    preview = mountPreview("see [[My Note]] now", 0, { noteIndex: NOTE_INDEX });
    const linkEl = preview.view.dom.querySelector(".cm-link-resolved") as HTMLElement;
    expect(linkEl).not.toBeNull();
    // Should not throw — just a no-op.
    expect(() =>
      linkEl.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    ).not.toThrow();
  });

  it("calls onOpenNote with the correct path for an aliased link", () => {
    const onOpenNote = vi.fn();
    preview = mountPreview("see [[Other|display text]] now", 0, {
      noteIndex: NOTE_INDEX,
      onOpenNote
    });
    const linkEl = preview.view.dom.querySelector(".cm-link-resolved") as HTMLElement;
    expect(linkEl).not.toBeNull();
    linkEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onOpenNote).toHaveBeenCalledWith("folder/Other.md");
  });
});
