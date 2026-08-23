import { describe, expect, it } from "vitest";

import type { NoteChange } from "../events/noteChangeSubscription";
import {
  anchorDiskContents,
  applyRefusedSave,
  applyReloadedDocument,
  applySavedDocument,
  clearConflict,
  markConflict,
  moveDocumentView,
  planDocumentSync,
  pruneConflicts,
  saveablePrecondition,
  type OpenDocument
} from "./externalDocumentSync";
import type { DocumentViewState } from "./shellTypes";

/** A tab with no unsaved edits: what it shows is what disk holds. */
const ready = (contents: string, diskContents: string = contents): DocumentViewState => ({
  contents,
  diskContents,
  phase: "ready",
  error: null
});

const ROOT = "/vault";

const openDocument = (relativePath: string, isDirty = false): OpenDocument => ({
  tabId: `editor:${relativePath}`,
  rootPath: ROOT,
  relativePath,
  isDirty
});

const savedExternally = (relativePath: string): NoteChange => ({
  kind: "saved",
  relativePath,
  origin: "external"
});

describe("deciding what to do about a note that changed on disk", () => {
  it("re-reads a note whose tab has nothing unsaved in it", () => {
    const open = [openDocument("notes/a.md"), openDocument("notes/b.md")];

    expect(planDocumentSync(open, savedExternally("notes/b.md"))).toEqual([
      { kind: "reload", tabId: "editor:notes/b.md", rootPath: ROOT, relativePath: "notes/b.md" }
    ]);
  });

  it("leaves a note that is not open alone", () => {
    const open = [openDocument("notes/a.md")];

    expect(planDocumentSync(open, savedExternally("notes/elsewhere.md"))).toEqual([]);
  });

  /**
   * The whole reason the events carry an origin. Re-reading the file we just
   * wrote would replace the buffer with the bytes on disk — and if the user
   * kept typing while the write was in flight, those keystrokes are the
   * difference between the two.
   */
  it("never re-reads a note because of the app's own save", () => {
    const open = [openDocument("notes/a.md")];
    const ourOwnSave: NoteChange = { kind: "saved", relativePath: "notes/a.md", origin: "local" };

    expect(planDocumentSync(open, ourOwnSave)).toEqual([]);
  });

  /**
   * Unsaved edits are the one thing that cannot be recovered from disk, so a
   * dirty tab is never overwritten. Two versions now exist and only the user
   * knows which matters, so the tab is flagged and they are asked.
   */
  it("asks about a tab with unsaved edits rather than overwriting it", () => {
    const open = [openDocument("notes/a.md", true)];

    expect(planDocumentSync(open, savedExternally("notes/a.md"))).toEqual([
      { kind: "conflict", tabId: "editor:notes/a.md" }
    ]);
  });

  it("re-reads a background tab, not only the one on screen", () => {
    const open = [openDocument("notes/a.md"), openDocument("notes/b.md")];

    const planned = planDocumentSync(open, savedExternally("notes/a.md"));

    expect(planned.map((action) => action.tabId)).toEqual(["editor:notes/a.md"]);
  });

  it("ignores a note that appeared, since nothing has it open yet", () => {
    const open = [openDocument("notes/a.md")];
    const created: NoteChange = { kind: "created", relativePath: "notes/a.md", origin: "external" };

    expect(planDocumentSync(open, created)).toEqual([]);
  });

  /**
   * A deleted note's tab keeps what the user was reading. Emptying it would
   * throw away the only remaining copy of a file someone may have removed by
   * mistake, and saving the tab puts it back.
   */
  it("leaves the buffer of a deleted note in place", () => {
    const open = [openDocument("notes/a.md")];
    const deleted: NoteChange = { kind: "deleted", relativePath: "notes/a.md", origin: "external" };

    expect(planDocumentSync(open, deleted)).toEqual([]);
  });

  it("does not re-read on a rename, which moves the tab rather than its text", () => {
    const open = [openDocument("notes/a.md")];
    const renamed: NoteChange = {
      kind: "renamed",
      oldRelativePath: "notes/a.md",
      newRelativePath: "notes/b.md",
      origin: "external"
    };

    expect(planDocumentSync(open, renamed)).toEqual([]);
  });

  it("has nothing to do when no note is open", () => {
    expect(planDocumentSync([], savedExternally("notes/a.md"))).toEqual([]);
  });
});

describe("putting a re-read note back into its tab", () => {
  it("shows the text that is now on disk", () => {
    const before = { a: ready("old") };

    const after = applyReloadedDocument(before, "a", "old", "new");

    expect(after.a).toEqual({
      contents: "new",
      diskContents: "new",
      phase: "ready",
      error: null,
      // An ordinary outside edit, not a note replaced with nothing.
      emptiedOutside: false
    });
  });

  /**
   * Reading a file takes long enough for someone to type into the tab while it
   * is in flight. Those keystrokes are the one copy of themselves, so the read
   * is dropped rather than applied over them — the tab is dirty now, and a
   * dirty tab is the user's to resolve.
   */
  it("drops a re-read the user has already typed over", () => {
    const before = { a: ready("typed since") };

    expect(applyReloadedDocument(before, "a", "old", "new")).toBe(before);
  });

  it("drops a re-read for a tab that has since been closed", () => {
    const before = { b: ready("other") };

    expect(applyReloadedDocument(before, "a", "old", "new")).toBe(before);
  });

  /** A save that did not change the bytes should not re-render the editor. */
  it("changes nothing when the file matches what the tab already shows", () => {
    const before = { a: ready("same") };

    expect(applyReloadedDocument(before, "a", "same", "same")).toBe(before);
  });

  it("leaves the other tabs untouched", () => {
    const before = { a: ready("old"), b: ready("elsewhere") };

    const after = applyReloadedDocument(before, "a", "old", "new");

    expect(after.b).toBe(before.b);
  });

  /**
   * A tab still loading is empty, and so is what it was expected to hold — the
   * two match, so the contents check alone would let this read land and then be
   * overwritten by the load already in flight, which may be reading older
   * bytes. The tab's own read is the one that should finish.
   */
  it("leaves a tab that is still loading to its own read", () => {
    const before = {
      a: { contents: "", diskContents: null, phase: "loading", error: null } as DocumentViewState
    };

    expect(applyReloadedDocument(before, "a", "", "new")).toBe(before);
  });

  it("does not quietly replace a read error with text", () => {
    const before = {
      a: {
        contents: "",
        diskContents: null,
        phase: "error",
        error: "Permission denied"
      } as DocumentViewState
    };

    expect(applyReloadedDocument(before, "a", "", "new")).toBe(before);
  });

  /**
   * The tab is showing the right text but believes disk holds something else,
   * so the next save would be refused over a difference nobody can see. Cannot
   * arise through the shell — only a clean tab is ever re-read, and a clean
   * tab's two texts agree — but the correction is a line, and being wrong here
   * looks to the user like a save that refuses for no reason.
   */
  it("corrects what a tab believes disk holds even with nothing to redraw", () => {
    const before = { a: ready("same", "stale") };

    expect(applyReloadedDocument(before, "a", "same", "same").a?.diskContents).toBe("same");
  });
});

describe("what a save from a tab is allowed to claim", () => {
  it("claims the text the tab is level with on disk", () => {
    expect(saveablePrecondition(ready("typed", "on disk"))).toBe("on disk");
  });

  /**
   * An empty file is a real state, and saving over one is a real thing to do.
   * Confusing it with "nothing was read" would refuse a legitimate save.
   */
  it("can claim an empty file", () => {
    expect(saveablePrecondition(ready("typed", ""))).toBe("");
  });

  /**
   * Nothing was ever read here, so the buffer is not a version of the file. The
   * failed-load case is the one that bites: its buffer is empty, and saving it
   * would put nothing over a file the shell could not even read.
   */
  it("refuses a tab whose read never landed", () => {
    const failed: DocumentViewState = {
      contents: "",
      diskContents: null,
      phase: "error",
      error: "Permission denied"
    };

    expect(saveablePrecondition(failed)).toBeNull();
  });

  /**
   * A read is already in flight and about to replace this buffer, so saving now
   * races it: whichever lands second wins, and if the read started before the
   * write it puts the pre-write text back over what was just saved. Refusing is
   * separate from the check above — a view can be mid-read and still know what
   * disk held before it started.
   */
  it("refuses a tab still being read", () => {
    const loading: DocumentViewState = {
      contents: "text",
      diskContents: "on disk",
      phase: "loading",
      error: null
    };

    expect(saveablePrecondition(loading)).toBeNull();
  });
});

describe("settling a tab after its save", () => {
  /**
   * Disk now holds what was *sent*, which is not always what the tab shows: a
   * save is a round trip and the user can type through it. Recording the buffer
   * instead would leave the tab claiming a version that was never written, and
   * the next save would be refused over the user's own keystrokes.
   */
  it("records what was written, not what has been typed since", () => {
    const before = { a: ready("typed during the save", "before the save") };

    const after = applySavedDocument(before, "a", "what was sent");

    expect(after.a).toEqual({
      contents: "typed during the save",
      diskContents: "what was sent",
      phase: "ready",
      error: null
    });
  });

  it("clears an error the retry has now settled", () => {
    const before = {
      a: { contents: "text", diskContents: "old", phase: "error", error: "Disk full" } as DocumentViewState
    };

    expect(applySavedDocument(before, "a", "text").a).toEqual({
      contents: "text",
      diskContents: "text",
      phase: "ready",
      error: null
    });
  });

  /** Closing a tab mid-save must not bring it back; the write still landed. */
  it("does not resurrect a tab closed while its save was in flight", () => {
    const before = { b: ready("other") };

    expect(applySavedDocument(before, "a", "written")).toBe(before);
  });
});

describe("settling a tab after a refused save", () => {
  /**
   * A refusal is not a failure. The text is still the user's only copy and they
   * are being asked a question about it, so the tab goes back to something they
   * can keep typing in rather than showing an error they cannot act on.
   */
  it("returns the tab to a state the user can go on typing in", () => {
    const before = {
      a: { contents: "mine", diskContents: "stale", phase: "saving", error: null } as DocumentViewState
    };

    expect(applyRefusedSave(before, "a").a).toEqual({
      contents: "mine",
      diskContents: "stale",
      phase: "ready",
      error: null
    });
  });

  /**
   * Anchoring it to what disk holds now would silently arm the next save to
   * overwrite — the opposite of what refusing it was for. Only the user
   * choosing "keep mine" may move this.
   */
  it("leaves the tab still claiming the version that was refused", () => {
    const before = { a: ready("mine", "stale") };

    expect(applyRefusedSave(before, "a").a?.diskContents).toBe("stale");
  });

  it("ignores a tab closed while its save was in flight", () => {
    const before = { b: ready("other") };

    expect(applyRefusedSave(before, "a")).toBe(before);
  });
});

describe("re-anchoring a tab to what disk holds", () => {
  /**
   * "Keep mine" leaves the buffer exactly as the user typed it. What it must
   * change is the text the *precondition* is computed from — otherwise the save
   * that follows is refused against the version they just declined, and the
   * notice they dismissed comes straight back.
   */
  it("changes what disk is believed to hold without touching the buffer", () => {
    const before = { a: ready("mine", "theirs") };

    const after = anchorDiskContents(before, "a", "theirs and then some");

    expect(after.a).toEqual({
      contents: "mine",
      diskContents: "theirs and then some",
      phase: "ready",
      error: null
    });
  });

  it("ignores a tab that has since been closed", () => {
    const before = { b: ready("other") };

    expect(anchorDiskContents(before, "a", "text")).toBe(before);
  });

  it("changes nothing when the belief is already right", () => {
    const before = { a: ready("mine", "theirs") };

    expect(anchorDiskContents(before, "a", "theirs")).toBe(before);
  });

  it("leaves the other tabs untouched", () => {
    const before = { a: ready("mine", "theirs"), b: ready("elsewhere") };

    expect(anchorDiskContents(before, "a", "newer").b).toBe(before.b);
  });
});

describe("moving a tab's text when its file is renamed", () => {
  it("keeps the text under the tab's new identity", () => {
    const before = { old: ready("text"), other: ready("elsewhere") };

    const after = moveDocumentView(before, "old", "new");

    expect(after).toEqual({ new: ready("text"), other: ready("elsewhere") });
  });

  /** The text did not change, only the name — re-reading it would be waste. */
  it("carries unsaved edits across rather than re-reading the file", () => {
    const before = { old: ready("edited but not saved") };

    expect(moveDocumentView(before, "old", "new").new).toBe(before.old);
  });

  it("replaces whatever was already under the new identity", () => {
    const before = { old: ready("moving"), new: ready("overwritten") };

    expect(moveDocumentView(before, "old", "new")).toEqual({ new: ready("moving") });
  });

  it("changes nothing when the tab has no loaded text", () => {
    const before = { other: ready("elsewhere") };

    expect(moveDocumentView(before, "old", "new")).toBe(before);
  });

  it("changes nothing when a tab is renamed onto itself", () => {
    const before = { same: ready("text") };

    expect(moveDocumentView(before, "same", "same")).toBe(before);
  });
});

describe("tracking which tabs are waiting on an answer", () => {
  it("remembers a tab that needs one", () => {
    expect(markConflict(new Set(), "a")).toEqual(new Set(["a"]));
  });

  it("stays the same set when a tab is already flagged", () => {
    const before = new Set(["a"]);

    expect(markConflict(before, "a")).toBe(before);
  });

  it("forgets a tab once it has been answered", () => {
    expect(clearConflict(new Set(["a", "b"]), "a")).toEqual(new Set(["b"]));
  });

  it("stays the same set when clearing a tab that was never flagged", () => {
    const before = new Set(["a"]);

    expect(clearConflict(before, "b")).toBe(before);
  });

  /**
   * A closed tab cannot answer, and its flag would come back to life if a tab
   * for the same file were opened again — the id is built from the path.
   */
  it("forgets tabs that have been closed", () => {
    expect(pruneConflicts(new Set(["a", "b"]), new Set(["b"]))).toEqual(new Set(["b"]));
  });

  it("stays the same set when every flagged tab is still open", () => {
    const before = new Set(["a"]);

    expect(pruneConflicts(before, new Set(["a", "b"]))).toBe(before);
  });

  it("stays the same set when nothing is flagged", () => {
    const before: ReadonlySet<string> = new Set();

    expect(pruneConflicts(before, new Set(["a"]))).toBe(before);
  });
});

describe("a note that went empty outside the app", () => {
  /**
   * The failure people actually report: a note that "went blank" after a sync
   * client or a crash. The signal is not emptiness — it is emptiness arriving
   * from *outside*, which is the only thing that separates damage from someone
   * deleting their own text and saving. The app's own writes are echo-
   * suppressed and never reach this path, so they cannot trip it.
   */
  it("marks the view so the tab can offer the kept version", () => {
    const before = { a: ready("the writing that was there") };

    const after = applyReloadedDocument(before, "a", "the writing that was there", "");

    expect(after.a?.contents).toBe("");
    expect(after.a?.emptiedOutside).toBe(true);
  });

  it("does not mark a note that was already empty", () => {
    // Nothing was lost, so there is nothing to say.
    const before = { a: ready("") };

    const after = applyReloadedDocument(before, "a", "", "");

    expect(after.a?.emptiedOutside).toBeFalsy();
  });

  it("clears the mark when real content arrives again", () => {
    const emptied = applyReloadedDocument({ a: ready("first") }, "a", "first", "");
    expect(emptied.a?.emptiedOutside).toBe(true);

    const restored = applyReloadedDocument(emptied, "a", "", "first again");

    expect(restored.a?.emptiedOutside).toBeFalsy();
  });
});
