import { describe, expect, it, vi } from "vitest";

import { appEvents } from "./appEvents";
import { subscribeIndexToNoteEvents, type NoteIndexUpdater } from "./noteIndexSubscription";

/** A stand-in index that records what the subscription asked it to do. */
const updater = () => ({
  reindexDocument: vi.fn<NoteIndexUpdater["reindexDocument"]>(),
  removeDocument: vi.fn<NoteIndexUpdater["removeDocument"]>(),
  reindexRenamedDocument: vi.fn<NoteIndexUpdater["reindexRenamedDocument"]>()
});

describe("the note-event subscription shared by derived indexes", () => {
  it("reindexes a note the moment it is written, however it was written", () => {
    const index = updater();
    const unsubscribe = subscribeIndexToNoteEvents(() => index);

    appEvents.emit("note.saved", { rootPath: "/vault", relativePath: "a.md" });
    appEvents.emit("note.created", { rootPath: "/vault", relativePath: "b.md" });

    expect(index.reindexDocument.mock.calls).toEqual([
      ["/vault", "a.md"],
      ["/vault", "b.md"]
    ]);
    unsubscribe();
  });

  it("carries both paths through a rename so the index can move the entry", () => {
    const index = updater();
    const unsubscribe = subscribeIndexToNoteEvents(() => index);

    appEvents.emit("note.renamed", {
      rootPath: "/vault",
      oldRelativePath: "old.md",
      newRelativePath: "new.md"
    });

    expect(index.reindexRenamedDocument).toHaveBeenCalledWith("/vault", "old.md", "new.md");
    expect(index.reindexDocument).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("drops a deleted note from the index", () => {
    const index = updater();
    const unsubscribe = subscribeIndexToNoteEvents(() => index);

    appEvents.emit("note.deleted", { rootPath: "/vault", relativePath: "gone.md" });

    expect(index.removeDocument).toHaveBeenCalledWith("/vault", "gone.md");
    unsubscribe();
  });

  /**
   * The updater is resolved per event rather than captured once, because the
   * stores that use this pass their Zustand `get`. Capturing the result at
   * subscribe time would pin the index to the state it had when the workspace
   * opened.
   */
  it("reads the updater fresh on every event", () => {
    const first = updater();
    const second = updater();
    let current = first;
    const unsubscribe = subscribeIndexToNoteEvents(() => current);

    appEvents.emit("note.saved", { rootPath: "/vault", relativePath: "a.md" });
    current = second;
    appEvents.emit("note.saved", { rootPath: "/vault", relativePath: "b.md" });

    expect(first.reindexDocument).toHaveBeenCalledTimes(1);
    expect(second.reindexDocument).toHaveBeenCalledWith("/vault", "b.md");
    unsubscribe();
  });

  it("stops listening once unsubscribed, so a closed workspace cannot reindex", () => {
    const index = updater();
    const unsubscribe = subscribeIndexToNoteEvents(() => index);

    unsubscribe();
    appEvents.emit("note.saved", { rootPath: "/vault", relativePath: "a.md" });
    appEvents.emit("note.deleted", { rootPath: "/vault", relativePath: "a.md" });
    appEvents.emit("note.renamed", {
      rootPath: "/vault",
      oldRelativePath: "a.md",
      newRelativePath: "b.md"
    });

    expect(index.reindexDocument).not.toHaveBeenCalled();
    expect(index.removeDocument).not.toHaveBeenCalled();
    expect(index.reindexRenamedDocument).not.toHaveBeenCalled();
  });
});
