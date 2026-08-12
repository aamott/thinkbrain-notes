import { describe, expect, it } from "vitest";

import type { NoteChange } from "../events/noteChangeSubscription";
import {
  applyReloadedDocument,
  documentsToReload,
  moveDocumentView,
  type OpenDocument
} from "./externalDocumentSync";
import type { DocumentViewState } from "./shellTypes";

const ready = (contents: string): DocumentViewState => ({
  contents,
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

describe("deciding which open notes to re-read from disk", () => {
  it("re-reads a note that changed underneath its tab", () => {
    const open = [openDocument("notes/a.md"), openDocument("notes/b.md")];

    expect(documentsToReload(open, savedExternally("notes/b.md"))).toEqual([
      { tabId: "editor:notes/b.md", rootPath: ROOT, relativePath: "notes/b.md" }
    ]);
  });

  it("leaves a note that is not open alone", () => {
    const open = [openDocument("notes/a.md")];

    expect(documentsToReload(open, savedExternally("notes/elsewhere.md"))).toEqual([]);
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

    expect(documentsToReload(open, ourOwnSave)).toEqual([]);
  });

  /**
   * Unsaved edits are the one thing that cannot be recovered from disk, so a
   * dirty tab is never overwritten. The user is asked instead — until that
   * prompt exists, the tab is simply left as it is.
   */
  it("never overwrites a tab with unsaved edits", () => {
    const open = [openDocument("notes/a.md", true)];

    expect(documentsToReload(open, savedExternally("notes/a.md"))).toEqual([]);
  });

  it("re-reads a background tab, not only the one on screen", () => {
    const open = [openDocument("notes/a.md"), openDocument("notes/b.md")];

    const reloads = documentsToReload(open, savedExternally("notes/a.md"));

    expect(reloads.map((target) => target.tabId)).toEqual(["editor:notes/a.md"]);
  });

  it("ignores a note that appeared, since nothing has it open yet", () => {
    const open = [openDocument("notes/a.md")];
    const created: NoteChange = { kind: "created", relativePath: "notes/a.md", origin: "external" };

    expect(documentsToReload(open, created)).toEqual([]);
  });

  /**
   * A deleted note's tab keeps what the user was reading. Emptying it would
   * throw away the only remaining copy of a file someone may have removed by
   * mistake, and saving the tab puts it back.
   */
  it("leaves the buffer of a deleted note in place", () => {
    const open = [openDocument("notes/a.md")];
    const deleted: NoteChange = { kind: "deleted", relativePath: "notes/a.md", origin: "external" };

    expect(documentsToReload(open, deleted)).toEqual([]);
  });

  it("does not re-read on a rename, which moves the tab rather than its text", () => {
    const open = [openDocument("notes/a.md")];
    const renamed: NoteChange = {
      kind: "renamed",
      oldRelativePath: "notes/a.md",
      newRelativePath: "notes/b.md",
      origin: "external"
    };

    expect(documentsToReload(open, renamed)).toEqual([]);
  });

  it("has nothing to do when no note is open", () => {
    expect(documentsToReload([], savedExternally("notes/a.md"))).toEqual([]);
  });
});

describe("putting a re-read note back into its tab", () => {
  it("shows the text that is now on disk", () => {
    const before = { a: ready("old") };

    const after = applyReloadedDocument(before, "a", "old", "new");

    expect(after.a).toEqual({ contents: "new", phase: "ready", error: null });
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
    const before = { a: { contents: "", phase: "loading", error: null } as DocumentViewState };

    expect(applyReloadedDocument(before, "a", "", "new")).toBe(before);
  });

  it("does not quietly replace a read error with text", () => {
    const before = {
      a: { contents: "", phase: "error", error: "Permission denied" } as DocumentViewState
    };

    expect(applyReloadedDocument(before, "a", "", "new")).toBe(before);
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
