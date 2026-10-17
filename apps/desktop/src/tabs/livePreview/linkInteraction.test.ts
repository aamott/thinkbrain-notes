// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NoteIndexEntry } from "@thinkbrain/core";

import { mountPreview, type PreviewHandle } from "./harness";
import type { LivePreviewOptions } from "./options";

/**
 * Gesture-level contract for live-preview link following — the piece a real
 * browser breaks when press and release land on different DOM.
 *
 * happy-dom has no layout and no native selection, so `getBoundingClientRect`
 * returns zeros and `clientX/Y` default to 0: every synthetic event sits
 * inside the (zero) rect and the drift budget. The DOM-identity path —
 * which `.cm-link-resolved` element the release lands on — is what these
 * tests exercise; the coordinate path is covered by the e2e specs.
 */

let preview: PreviewHandle | null = null;

afterEach(() => {
  preview?.destroy();
  preview = null;
});

const NOTE_INDEX: readonly NoteIndexEntry[] = [
  { relativePath: "My Note.md", fileName: "My Note.md", title: undefined, aliases: [] }
];

const OPTIONS = (onOpenLink: LivePreviewOptions["onOpenLink"]): LivePreviewOptions => ({
  noteIndex: NOTE_INDEX,
  relativePath: "home.md",
  onOpenLink
});

function resolvedLink(): HTMLElement {
  const el = preview!.view.dom.querySelector(".cm-link-resolved");
  if (!(el instanceof HTMLElement)) throw new Error("no .cm-link-resolved mounted");
  return el;
}

describe("link gesture tracking", () => {
  it("consumes mousedown on a concealed press so the caret never enters the link", () => {
    const follow = vi.fn();
    preview = mountPreview("see [the note](My%20Note.md) now", 0, OPTIONS(follow));
    const linkEl = resolvedLink();

    linkEl.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    // `cancelable` mirrors the real event — only then does preventDefault stick.
    const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    linkEl.dispatchEvent(down);
    // Intercepted: CodeMirror's built-in selection handling must not run —
    // this is what keeps the caret parked and the syntax concealed.
    expect(down.defaultPrevented).toBe(true);

    linkEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(follow).toHaveBeenCalledTimes(1);
    expect(preview.view.state.selection.main.head).toBe(0);
  });

  it("leaves mousedown default on a revealed press", () => {
    const follow = vi.fn();
    // Cursor at 10 sits inside the link — revealed presses are edits.
    preview = mountPreview("see [the note](My%20Note.md) now", 10, OPTIONS(follow));
    const linkEl = resolvedLink();

    linkEl.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    const down = new MouseEvent("mousedown", { bubbles: true });
    linkEl.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(false);
    linkEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(follow).not.toHaveBeenCalled();
  });

  it("consumes mousedown for an explicit Mod follow on a revealed link", () => {
    const follow = vi.fn();
    preview = mountPreview("see [the note](My%20Note.md) now", 10, OPTIONS(follow));
    const linkEl = resolvedLink();

    linkEl.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, ctrlKey: true }));
    const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true, ctrlKey: true });
    linkEl.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    linkEl.dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
    expect(follow).toHaveBeenCalledTimes(1);
  });

  it("follows once even though the click lands on rebuilt line DOM", () => {
    const follow = vi.fn();
    preview = mountPreview("see [the note](My%20Note.md) now", 0, OPTIONS(follow));
    const linkEl = resolvedLink();
    const line = linkEl.closest(".cm-line") as HTMLElement;

    linkEl.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    linkEl.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    // The retarget a reveal can cause: the release reaches `.cm-line`
    // instead of the link element — the press-time gesture still decides.
    line.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(follow).toHaveBeenCalledTimes(1);
  });

  it("does not follow when the pointer drags past the drift budget", () => {
    const follow = vi.fn();
    preview = mountPreview("see [the note](My%20Note.md) now", 0, OPTIONS(follow));
    const linkEl = resolvedLink();

    linkEl.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    linkEl.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    linkEl.dispatchEvent(
      new MouseEvent("pointermove", { bubbles: true, clientX: 40, clientY: 40 })
    );
    linkEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(follow).not.toHaveBeenCalled();
  });

  it("does not follow after pointercancel", () => {
    const follow = vi.fn();
    preview = mountPreview("see [the note](My%20Note.md) now", 0, OPTIONS(follow));
    const linkEl = resolvedLink();

    linkEl.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    linkEl.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    linkEl.dispatchEvent(new MouseEvent("pointercancel", { bubbles: true }));
    linkEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(follow).not.toHaveBeenCalled();
  });

  it("does not follow when the document changed between press and release", () => {
    const follow = vi.fn();
    preview = mountPreview("see [the note](My%20Note.md) now", 0, OPTIONS(follow));
    const linkEl = resolvedLink();

    linkEl.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    linkEl.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    preview.view.dispatch({ changes: { from: 0, insert: "!" } });
    linkEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(follow).not.toHaveBeenCalled();
  });

  it("does not follow when the release lands on a different link", () => {
    const follow = vi.fn();
    preview = mountPreview("see [a](My%20Note.md) and [b](My%20Note.md) now", 0, OPTIONS(follow));
    const [first, second] = [
      ...preview.view.dom.querySelectorAll<HTMLElement>(".cm-link-resolved")
    ];
    expect(second).toBeDefined();

    first!.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    first!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    second!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(follow).not.toHaveBeenCalled();
  });

  it("ignores secondary-button presses entirely", () => {
    const follow = vi.fn();
    preview = mountPreview("see [the note](My%20Note.md) now", 0, OPTIONS(follow));
    const linkEl = resolvedLink();

    linkEl.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 2 }));
    const down = new MouseEvent("mousedown", { bubbles: true, button: 2 });
    linkEl.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(false);
    linkEl.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 2 }));
    expect(follow).not.toHaveBeenCalled();
  });

  it("does not follow a second click without a fresh press", () => {
    const follow = vi.fn();
    preview = mountPreview("see [the note](My%20Note.md) now", 0, OPTIONS(follow));
    const linkEl = resolvedLink();

    linkEl.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    linkEl.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    linkEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    linkEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(follow).toHaveBeenCalledTimes(1);
  });
});
