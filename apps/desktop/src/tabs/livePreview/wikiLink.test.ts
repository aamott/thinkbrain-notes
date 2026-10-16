// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NoteIndexEntry } from "@thinkbrain/core";
import { keymap } from "@codemirror/view";

import { mountPreview, type PreviewHandle } from "./harness";

let preview: PreviewHandle | null = null;

afterEach(() => {
  preview?.destroy();
  preview = null;
});

/** Finds and runs a named keybinding in the editor's keymap facet. */
function runKeymap(view: PreviewHandle["view"], key: string): boolean {
  // `keymap` facet inputs are arrays; flatten to get individual bindings.
  const bindings = (view.state.facet(keymap) as unknown[]).flat() as Array<{
    key?: string;
    run?: (v: PreviewHandle["view"]) => boolean | void;
  }>;
  for (const binding of bindings) {
    if (binding.key === key && binding.run) {
      const result = binding.run(view);
      return typeof result === "boolean" ? result : false;
    }
  }
  return false;
}

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
    preview = mountPreview("see [[My Note]] now", 0, {
      noteIndex: NOTE_INDEX,
      onOpenLink: vi.fn()
    });
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
    preview = mountPreview("see [[alias-note]] now", 0, {
      noteIndex: NOTE_INDEX,
      onOpenLink: vi.fn()
    });
    expect(preview.view.dom.querySelector(".cm-link-resolved")).not.toBeNull();
  });

  it("resolves a link by title", () => {
    preview = mountPreview("see [[Other Title]] now", 0, {
      noteIndex: NOTE_INDEX,
      onOpenLink: vi.fn()
    });
    expect(preview.view.dom.querySelector(".cm-link-resolved")).not.toBeNull();
  });

  it("marks a resolved link with alias display text", () => {
    preview = mountPreview("see [[My Note|display]] now", 0, {
      noteIndex: NOTE_INDEX,
      onOpenLink: vi.fn()
    });
    expect(preview.view.dom.querySelector(".cm-link-resolved")).not.toBeNull();
    expect(preview.lineText(1)).toBe("see display now");
  });
});

/** Dispatches the pointerdown+click pair a real pointer press produces. */
function pressLink(el: HTMLElement, init: MouseEventInit = {}): void {
  el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, ...init }));
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, ...init }));
}

describe("wiki link click navigation", () => {
  it("calls onOpenLink when a resolved wiki link is clicked", () => {
    const onOpenLink = vi.fn();
    preview = mountPreview("see [[My Note]] now", 0, {
      noteIndex: NOTE_INDEX,
      onOpenLink
    });
    const linkEl = preview.view.dom.querySelector(".cm-link-resolved") as HTMLElement;
    expect(linkEl).not.toBeNull();
    pressLink(linkEl);
    expect(onOpenLink).toHaveBeenCalledTimes(1);
    expect(onOpenLink).toHaveBeenCalledWith({ kind: "internal", relativePath: "My Note.md" });
  });

  it("does not call onOpenLink when an unresolved wiki link is clicked", () => {
    const onOpenLink = vi.fn();
    preview = mountPreview("see [[Nonexistent]] now", 0, {
      noteIndex: NOTE_INDEX,
      onOpenLink
    });
    const linkEl = preview.view.dom.querySelector(".cm-link-broken") as HTMLElement;
    expect(linkEl).not.toBeNull();
    pressLink(linkEl);
    expect(onOpenLink).not.toHaveBeenCalled();
  });

  it("does not style a resolved link as clickable when no callback exists", () => {
    // A pointer that lies is worse than no styling: the link resolves, but
    // with nothing to follow it with it stays a plain edit target.
    preview = mountPreview("see [[My Note]] now", 0, { noteIndex: NOTE_INDEX });
    expect(preview.view.dom.querySelector(".cm-link-resolved")).toBeNull();
    const linkEl = preview.view.dom.querySelector(".cm-link-text") as HTMLElement;
    expect(linkEl).not.toBeNull();
    expect(() => pressLink(linkEl)).not.toThrow();
  });

  it("calls onOpenLink with the correct path for an aliased link", () => {
    const onOpenLink = vi.fn();
    preview = mountPreview("see [[Other|display text]] now", 0, {
      noteIndex: NOTE_INDEX,
      onOpenLink
    });
    const linkEl = preview.view.dom.querySelector(".cm-link-resolved") as HTMLElement;
    expect(linkEl).not.toBeNull();
    pressLink(linkEl);
    expect(onOpenLink).toHaveBeenCalledWith({ kind: "internal", relativePath: "folder/Other.md" });
  });

  it("does not follow a revealed link on a plain click", () => {
    const onOpenLink = vi.fn();
    // Cursor at 8 sits inside [[My Note]], so the syntax is already revealed —
    // a plain click is an edit, not a follow.
    preview = mountPreview("see [[My Note]] now", 8, {
      noteIndex: NOTE_INDEX,
      onOpenLink
    });
    const linkEl = preview.view.dom.querySelector(".cm-link-resolved") as HTMLElement;
    expect(linkEl).not.toBeNull();
    pressLink(linkEl);
    expect(onOpenLink).not.toHaveBeenCalled();
  });

  it("follows a revealed link on Mod+click", () => {
    const onOpenLink = vi.fn();
    preview = mountPreview("see [[My Note]] now", 8, {
      noteIndex: NOTE_INDEX,
      onOpenLink
    });
    const linkEl = preview.view.dom.querySelector(".cm-link-resolved") as HTMLElement;
    expect(linkEl).not.toBeNull();
    pressLink(linkEl, { ctrlKey: true });
    expect(onOpenLink).toHaveBeenCalledWith({ kind: "internal", relativePath: "My Note.md" });
  });

  it("does not follow when the press started outside the link", () => {
    const onOpenLink = vi.fn();
    preview = mountPreview("see [[My Note]] now", 0, {
      noteIndex: NOTE_INDEX,
      onOpenLink
    });
    const linkEl = preview.view.dom.querySelector(".cm-link-resolved") as HTMLElement;
    const line = linkEl.closest(".cm-line") as HTMLElement;
    // A press that begins off the link and releases onto it is a selection
    // gesture, not a follow — only the click leg fires on the link.
    line.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    linkEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onOpenLink).not.toHaveBeenCalled();
  });
});

describe("wiki link keyboard navigation", () => {
  it("calls onOpenLink on Mod-Enter when the cursor is inside a resolved wiki link", () => {
    const onOpenLink = vi.fn();
    // Cursor inside [[My Note]] — "My Note" spans positions 5..12.
    preview = mountPreview("see [[My Note]] now", 8, {
      noteIndex: NOTE_INDEX,
      onOpenLink
    });
    expect(runKeymap(preview.view, "Mod-Enter")).toBe(true);
    expect(onOpenLink).toHaveBeenCalledTimes(1);
    expect(onOpenLink).toHaveBeenCalledWith({ kind: "internal", relativePath: "My Note.md" });
  });

  it("does not call onOpenLink on Mod-Enter when the cursor is not inside a wiki link", () => {
    const onOpenLink = vi.fn();
    preview = mountPreview("see [[My Note]] now", 0, {
      noteIndex: NOTE_INDEX,
      onOpenLink
    });
    expect(runKeymap(preview.view, "Mod-Enter")).toBe(false);
    expect(onOpenLink).not.toHaveBeenCalled();
  });

  it("does not call onOpenLink on Mod-Enter for an unresolved wiki link", () => {
    const onOpenLink = vi.fn();
    preview = mountPreview("see [[Nonexistent]] now", 6, {
      noteIndex: NOTE_INDEX,
      onOpenLink
    });
    expect(runKeymap(preview.view, "Mod-Enter")).toBe(false);
    expect(onOpenLink).not.toHaveBeenCalled();
  });

  it("does not register a Mod-Enter binding when no callback is provided", () => {
    preview = mountPreview("see [[My Note]] now", 8, { noteIndex: NOTE_INDEX });
    expect(runKeymap(preview.view, "Mod-Enter")).toBe(false);
  });
});
