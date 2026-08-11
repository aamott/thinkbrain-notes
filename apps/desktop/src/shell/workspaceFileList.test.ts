import { describe, expect, it } from "vitest";

import { addWorkspaceFile, removeWorkspaceFile } from "./workspaceFileList";

const list = (...paths: readonly string[]) =>
  paths.reduce<ReturnType<typeof addWorkspaceFile>>(
    (files, path) => addWorkspaceFile(files, path),
    []
  );

describe("the shell's list of workspace notes", () => {
  it("names a new note by its file and folder so the palette can show it", () => {
    const files = addWorkspaceFile([], "journal/2026-08-11.md");

    expect(files).toEqual([
      {
        relative_path: "journal/2026-08-11.md",
        file_name: "2026-08-11.md",
        parent_path: "journal",
        byte_size: 0,
        updated_at: null
      }
    ]);
  });

  it("treats a note at the workspace root as having no parent folder", () => {
    const [entry] = addWorkspaceFile([], "top.md");

    expect(entry?.parent_path).toBe("");
    expect(entry?.file_name).toBe("top.md");
  });

  /**
   * The same note can be announced twice — the explorer's own callback and the
   * watcher's event both describe one creation — so adding has to be safe to
   * repeat.
   */
  it("ignores a note it already knows about, keeping the list identical", () => {
    const files = list("a.md");
    const again = addWorkspaceFile(files, "a.md");

    expect(again).toBe(files);
  });

  it("drops a deleted note", () => {
    const files = removeWorkspaceFile(list("a.md", "b.md"), "a.md");

    expect(files.map((file) => file.relative_path)).toEqual(["b.md"]);
  });

  it("leaves the list alone when the note was never there", () => {
    const files = list("a.md");

    expect(removeWorkspaceFile(files, "missing.md")).toBe(files);
  });

  it("follows a rename as a removal and an addition", () => {
    const renamed = addWorkspaceFile(
      removeWorkspaceFile(list("notes/old.md", "keep.md"), "notes/old.md"),
      "notes/new.md"
    );

    expect(renamed.map((file) => file.relative_path)).toEqual(["keep.md", "notes/new.md"]);
  });
});
