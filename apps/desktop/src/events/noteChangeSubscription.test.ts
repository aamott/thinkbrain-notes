import { beforeEach, describe, expect, it, vi } from "vitest";

import { appEvents } from "./appEvents";
import { subscribeToNoteChanges, type NoteChange } from "./noteChangeSubscription";

const ROOT = "/vault";

describe("subscribing to note changes", () => {
  let seen: NoteChange[];
  let stop: () => void;

  beforeEach(() => {
    seen = [];
    stop = subscribeToNoteChanges(
      () => ROOT,
      (change) => seen.push(change)
    );
    return () => {
      stop();
    };
  });

  it("reports a created note", () => {
    appEvents.emit("note.created", { rootPath: ROOT, relativePath: "a.md" });

    expect(seen).toEqual([{ kind: "created", relativePath: "a.md", origin: "local" }]);
  });

  it("reports a saved note", () => {
    appEvents.emit("note.saved", { rootPath: ROOT, relativePath: "a.md" });

    expect(seen).toEqual([{ kind: "saved", relativePath: "a.md", origin: "local" }]);
  });

  it("reports a deleted note", () => {
    appEvents.emit("note.deleted", { rootPath: ROOT, relativePath: "a.md" });

    expect(seen).toEqual([{ kind: "deleted", relativePath: "a.md", origin: "local" }]);
  });

  it("reports a rename with both of its paths", () => {
    appEvents.emit("note.renamed", {
      rootPath: ROOT,
      oldRelativePath: "old.md",
      newRelativePath: "new.md"
    });

    expect(seen).toEqual([
      { kind: "renamed", oldRelativePath: "old.md", newRelativePath: "new.md", origin: "local" }
    ]);
  });

  it("passes an outside edit through as external", () => {
    appEvents.emit("note.saved", { rootPath: ROOT, relativePath: "a.md", origin: "external" });

    expect(seen).toEqual([{ kind: "saved", relativePath: "a.md", origin: "external" }]);
  });

  /**
   * An emitter that says nothing about where a change came from is treated as
   * the app's own write. The cost of guessing wrong that way is a stale view;
   * guessing the other way would overwrite what the user typed.
   */
  it("treats a change with no stated origin as the app's own", () => {
    appEvents.emit("note.saved", { rootPath: ROOT, relativePath: "a.md" });

    expect(seen[0]?.origin).toBe("local");
  });

  it("ignores a change in another workspace", () => {
    appEvents.emit("note.created", { rootPath: "/other", relativePath: "a.md" });
    appEvents.emit("note.saved", { rootPath: "/other", relativePath: "a.md" });
    appEvents.emit("note.deleted", { rootPath: "/other", relativePath: "a.md" });
    appEvents.emit("note.renamed", {
      rootPath: "/other",
      oldRelativePath: "a.md",
      newRelativePath: "b.md"
    });

    expect(seen).toEqual([]);
  });

  it("hears nothing once the subscription is stopped", () => {
    stop();

    appEvents.emit("note.created", { rootPath: ROOT, relativePath: "a.md" });

    expect(seen).toEqual([]);
  });
});

describe("a subscriber whose workspace changes", () => {
  /**
   * The workspace can be switched without the subscription being rebuilt, so
   * which root counts is asked at delivery time rather than captured up front.
   */
  it("follows the workspace it is asked about now, not the one it started with", () => {
    let root = "/first";
    const onChange = vi.fn();
    const stop = subscribeToNoteChanges(
      () => root,
      onChange
    );

    appEvents.emit("note.created", { rootPath: "/second", relativePath: "a.md" });
    expect(onChange).not.toHaveBeenCalled();

    root = "/second";
    appEvents.emit("note.created", { rootPath: "/second", relativePath: "a.md" });
    expect(onChange).toHaveBeenCalledTimes(1);

    stop();
  });

  it("ignores every change while no workspace is open", () => {
    const onChange = vi.fn();
    const stop = subscribeToNoteChanges(() => null, onChange);

    appEvents.emit("note.created", { rootPath: "/vault", relativePath: "a.md" });

    expect(onChange).not.toHaveBeenCalled();
    stop();
  });
});
