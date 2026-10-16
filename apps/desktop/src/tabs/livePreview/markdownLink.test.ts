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
    title: undefined,
    aliases: []
  }
];

/** Dispatches the pointerdown+click pair a real pointer press produces. */
function pressLink(el: HTMLElement, init: MouseEventInit = {}): void {
  el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, ...init }));
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, ...init }));
}

/** Finds and runs a named keybinding in the editor's keymap facet. */
function runKeymap(view: PreviewHandle["view"], key: string): boolean {
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

describe("markdown link live preview", () => {
  it("shows only the link text when the cursor is elsewhere", () => {
    preview = mountPreview("see [the note](My%20Note.md) now", 0);
    expect(preview.lineText(1)).toBe("see the note now");
  });

  it("reveals the full source when the cursor is inside", () => {
    preview = mountPreview("see [the note](My%20Note.md) now", 10);
    expect(preview.lineText(1)).toBe("see [the note](My%20Note.md) now");
  });

  it("marks a resolved internal link as resolved", () => {
    preview = mountPreview("see [the note](My%20Note.md) now", 0, {
      noteIndex: NOTE_INDEX,
      relativePath: "home.md",
      onOpenLink: vi.fn()
    });
    expect(preview.view.dom.querySelector(".cm-link-resolved")).not.toBeNull();
    expect(preview.view.dom.querySelector(".cm-link-broken")).toBeNull();
  });

  it("marks an unresolved internal link as broken", () => {
    preview = mountPreview("see [the note](Nope.md) now", 0, {
      noteIndex: NOTE_INDEX,
      relativePath: "home.md",
      onOpenLink: vi.fn()
    });
    expect(preview.view.dom.querySelector(".cm-link-broken")).not.toBeNull();
    expect(preview.view.dom.querySelector(".cm-link-resolved")).toBeNull();
  });

  it("does not style a resolved link as clickable when no callback exists", () => {
    preview = mountPreview("see [the note](My%20Note.md) now", 0, {
      noteIndex: NOTE_INDEX,
      relativePath: "home.md"
    });
    expect(preview.view.dom.querySelector(".cm-link-resolved")).toBeNull();
    expect(preview.view.dom.querySelector(".cm-link-broken")).toBeNull();
  });

  it("does not mark a reference-style link as broken", () => {
    // The target lives in a definition elsewhere — no inline URL to classify.
    preview = mountPreview("see [the note][ref] now", 0, {
      noteIndex: NOTE_INDEX,
      relativePath: "home.md",
      onOpenLink: vi.fn()
    });
    expect(preview.view.dom.querySelector(".cm-link-broken")).toBeNull();
  });

  it("marks a revealed link for editing", () => {
    preview = mountPreview("see [the note](My%20Note.md) now", 10, {
      noteIndex: NOTE_INDEX,
      relativePath: "home.md",
      onOpenLink: vi.fn()
    });
    expect(preview.view.dom.querySelector(".cm-link-revealed")).not.toBeNull();
  });
});

describe("markdown link click navigation", () => {
  it("opens an internal link relative to the containing note's folder", () => {
    const follow = vi.fn();
    preview = mountPreview("see [the note](Other.md) now", 0, {
      noteIndex: NOTE_INDEX,
      relativePath: "folder/home.md",
      onOpenLink: follow
    });
    const linkEl = preview.view.dom.querySelector(".cm-link-resolved") as HTMLElement;
    expect(linkEl).not.toBeNull();
    pressLink(linkEl);
    expect(follow).toHaveBeenCalledWith({
      kind: "internal",
      relativePath: "folder/Other.md"
    });
  });

  it("hands an external link to the host as a URL", () => {
    const follow = vi.fn();
    preview = mountPreview("see [site](https://example.com/x) now", 0, {
      noteIndex: NOTE_INDEX,
      relativePath: "home.md",
      onOpenLink: follow
    });
    const linkEl = preview.view.dom.querySelector(".cm-link-resolved") as HTMLElement;
    expect(linkEl).not.toBeNull();
    pressLink(linkEl);
    expect(follow).toHaveBeenCalledWith({
      kind: "external",
      url: "https://example.com/x"
    });
  });

  it("does not follow a revealed link on a plain click", () => {
    const follow = vi.fn();
    // Cursor at 10 sits inside the link — revealed, so a plain click edits.
    preview = mountPreview("see [the note](My%20Note.md) now", 10, {
      noteIndex: NOTE_INDEX,
      relativePath: "home.md",
      onOpenLink: follow
    });
    const linkEl = preview.view.dom.querySelector(".cm-link-text") as HTMLElement;
    pressLink(linkEl);
    expect(follow).not.toHaveBeenCalled();
  });

  it("follows a revealed link on Mod+click", () => {
    const follow = vi.fn();
    preview = mountPreview("see [the note](My%20Note.md) now", 10, {
      noteIndex: NOTE_INDEX,
      relativePath: "home.md",
      onOpenLink: follow
    });
    const linkEl = preview.view.dom.querySelector(".cm-link-text") as HTMLElement;
    pressLink(linkEl, { ctrlKey: true });
    expect(follow).toHaveBeenCalledWith({
      kind: "internal",
      relativePath: "My Note.md"
    });
  });

  it("does not follow when the press started outside the link", () => {
    const follow = vi.fn();
    preview = mountPreview("see [the note](My%20Note.md) now", 0, {
      noteIndex: NOTE_INDEX,
      relativePath: "home.md",
      onOpenLink: follow
    });
    const linkEl = preview.view.dom.querySelector(".cm-link-resolved") as HTMLElement;
    const line = linkEl.closest(".cm-line") as HTMLElement;
    // A press that begins off the link and releases onto it is a selection
    // gesture, not a follow — only the click leg fires on the link.
    line.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    linkEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(follow).not.toHaveBeenCalled();
  });

  it("never follows a link inside a code span", () => {
    const follow = vi.fn();
    // Backtick-wrapped link syntax parses as code, not a Link node — no
    // styling, no follow, Mod-Enter passes through.
    preview = mountPreview("see `[the note](My%20Note.md)` now", 10, {
      noteIndex: NOTE_INDEX,
      relativePath: "home.md",
      onOpenLink: follow
    });
    expect(preview.view.dom.querySelector(".cm-link-resolved")).toBeNull();
    expect(preview.view.dom.querySelector(".cm-link-broken")).toBeNull();
    expect(runKeymap(preview.view, "Mod-Enter")).toBe(false);
    expect(follow).not.toHaveBeenCalled();
  });
});

describe("source-mode link following", () => {
  it("mounts no decorations — the raw syntax is always visible", () => {
    preview = mountPreview("see [the note](My%20Note.md) now", 0, {
      noteIndex: NOTE_INDEX,
      relativePath: "home.md",
      sourceMode: true,
      onOpenLink: vi.fn()
    });
    expect(preview.lineText(1)).toBe("see [the note](My%20Note.md) now");
  });

  it("follows a link on Mod+click", () => {
    const follow = vi.fn();
    preview = mountPreview("see [the note](My%20Note.md) now", 0, {
      noteIndex: NOTE_INDEX,
      relativePath: "home.md",
      sourceMode: true,
      onOpenLink: follow
    });
    // Source mode has no decorated element to click, so pin the coordinate
    // lookup to a position inside the link — the harness has no real layout.
    const linkPos = preview.view.state.doc.toString().indexOf("My%20Note.md");
    preview.view.posAtCoords = () => linkPos;
    const line = preview.view.dom.querySelector(".cm-line") as HTMLElement;
    line.dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
    expect(follow).toHaveBeenCalledWith({
      kind: "internal",
      relativePath: "My Note.md"
    });
  });

  it("never follows on a plain click — it is always an edit gesture", () => {
    const follow = vi.fn();
    preview = mountPreview("see [the note](My%20Note.md) now", 0, {
      noteIndex: NOTE_INDEX,
      relativePath: "home.md",
      sourceMode: true,
      onOpenLink: follow
    });
    const linkPos = preview.view.state.doc.toString().indexOf("My%20Note.md");
    preview.view.posAtCoords = () => linkPos;
    const line = preview.view.dom.querySelector(".cm-line") as HTMLElement;
    line.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(follow).not.toHaveBeenCalled();
  });

  it("follows the link under the cursor on Mod-Enter", () => {
    const follow = vi.fn();
    // Cursor at 10 sits inside the link — Mod-Enter follows it just like in
    // live preview; live preview being off must not lose the binding.
    preview = mountPreview("see [the note](My%20Note.md) now", 10, {
      noteIndex: NOTE_INDEX,
      relativePath: "home.md",
      sourceMode: true,
      onOpenLink: follow
    });
    expect(runKeymap(preview.view, "Mod-Enter")).toBe(true);
    expect(follow).toHaveBeenCalledWith({
      kind: "internal",
      relativePath: "My Note.md"
    });
  });
});
