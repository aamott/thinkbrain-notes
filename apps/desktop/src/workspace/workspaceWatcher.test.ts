import { afterEach, describe, expect, it, vi } from "vitest";

import { appEvents } from "../events/appEvents";
import { applyWorkspaceChanges, type WorkspaceChange } from "./workspaceWatcher";

type Emitted = { readonly event: string; readonly payload: unknown };

/** Records every note event the translation emits, in order. */
const recordEmissions = (): { emitted: Emitted[]; stop: () => void } => {
  const emitted: Emitted[] = [];
  const names = ["note.created", "note.saved", "note.deleted", "note.renamed"] as const;
  const disposables = names.map((event) =>
    appEvents.on(event, (payload) => emitted.push({ event, payload }))
  );
  return { emitted, stop: () => disposables.forEach((d) => void d.dispose()) };
};

let stopRecording: (() => void) | null = null;
afterEach(() => {
  stopRecording?.();
  stopRecording = null;
});

const apply = (changes: readonly WorkspaceChange[], onRescan = vi.fn()) => {
  const { emitted, stop } = recordEmissions();
  stopRecording = stop;
  applyWorkspaceChanges("/vault", changes, onRescan);
  return { emitted, onRescan };
};

describe("translating outside edits into the app's own note events", () => {
  it("announces a note that appeared on disk as a creation", () => {
    const { emitted } = apply([{ kind: "created", path: "notes/new.md" }]);

    expect(emitted).toEqual([
      { event: "note.created", payload: { rootPath: "/vault", relativePath: "notes/new.md" } }
    ]);
  });

  /**
   * An outside edit is the same fact as an in-app save: the bytes changed.
   * Reusing `note.saved` is what lets every existing cache stay unchanged.
   */
  it("announces an outside edit as a save", () => {
    const { emitted } = apply([{ kind: "modified", path: "notes/edited.md" }]);

    expect(emitted).toEqual([
      { event: "note.saved", payload: { rootPath: "/vault", relativePath: "notes/edited.md" } }
    ]);
  });

  it("announces a vanished note as a deletion", () => {
    const { emitted } = apply([{ kind: "deleted", path: "notes/gone.md" }]);

    expect(emitted).toEqual([
      { event: "note.deleted", payload: { rootPath: "/vault", relativePath: "notes/gone.md" } }
    ]);
  });

  it("carries both ends of a rename so an index can move its entry", () => {
    const { emitted } = apply([
      { kind: "renamed", path: "notes/new.md", oldPath: "notes/old.md" }
    ]);

    expect(emitted).toEqual([
      {
        event: "note.renamed",
        payload: {
          rootPath: "/vault",
          oldRelativePath: "notes/old.md",
          newRelativePath: "notes/new.md"
        }
      }
    ]);
  });

  /**
   * The events carry the root the caller passed, not the canonical one the
   * watcher reports, because the stores guard every update against the exact
   * string they were opened with.
   */
  it("tags events with the caller's spelling of the workspace root", () => {
    const { emitted, stop } = recordEmissions();
    stopRecording = stop;

    applyWorkspaceChanges("/home/me/vault", [{ kind: "created", path: "a.md" }], vi.fn());

    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.payload).toMatchObject({ rootPath: "/home/me/vault" });
  });

  it("asks for a rebuild when the change cannot be named path by path", () => {
    const { emitted, onRescan } = apply([{ kind: "rescan", path: "" }]);

    expect(onRescan).toHaveBeenCalledTimes(1);
    expect(emitted).toEqual([]);
  });

  it("delivers a whole batch in order", () => {
    const { emitted } = apply([
      { kind: "created", path: "a.md" },
      { kind: "modified", path: "b.md" },
      { kind: "deleted", path: "c.md" }
    ]);

    expect(emitted.map((entry) => entry.event)).toEqual([
      "note.created",
      "note.saved",
      "note.deleted"
    ]);
  });

  /**
   * A rename with no origin cannot be turned into `note.renamed`, whose whole
   * point is the pair of paths. Treating it as a creation keeps the new file
   * indexed rather than dropping the change on the floor.
   */
  it("falls back to a creation when a rename arrives without its origin", () => {
    const { emitted } = apply([{ kind: "renamed", path: "notes/new.md" }]);

    expect(emitted).toEqual([
      { event: "note.created", payload: { rootPath: "/vault", relativePath: "notes/new.md" } }
    ]);
  });

  it("ignores a change kind it does not recognise rather than throwing", () => {
    const { emitted, onRescan } = apply([
      { kind: "teleported" as WorkspaceChange["kind"], path: "a.md" },
      { kind: "created", path: "b.md" }
    ]);

    expect(onRescan).not.toHaveBeenCalled();
    expect(emitted).toEqual([
      { event: "note.created", payload: { rootPath: "/vault", relativePath: "b.md" } }
    ]);
  });
});
