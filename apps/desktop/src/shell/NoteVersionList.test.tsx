// @vitest-environment happy-dom
/**
 * Restoring overwrites a note, so the thing most worth pinning here is that it
 * cannot happen in one click. Someone reaching this list has already lost
 * something once.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { KeptVersion } from "../workspace/noteBackupService";
import { NoteVersionList } from "./NoteVersionList";

const listNoteVersions = vi.fn<() => Promise<readonly KeptVersion[]>>();
const restoreNoteVersion = vi.fn<() => Promise<null>>();

vi.mock("../workspace/noteBackupService", () => ({
  listNoteVersions: () => listNoteVersions(),
  restoreNoteVersion: () => restoreNoteVersion()
}));

const onRestored = vi.fn();

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  listNoteVersions.mockReset();
  restoreNoteVersion.mockReset();
  restoreNoteVersion.mockResolvedValue(null);
  onRestored.mockReset();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

async function mountList(): Promise<HTMLElement> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(
      <NoteVersionList rootPath="/vault" relativePath="note.md" onRestored={onRestored} />
    );
  });
  return host;
}

/** The button whose visible text is exactly `label`. */
function button(container: HTMLElement, label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll("button")].find(
    (element) => element.textContent?.trim() === label
  );
}

async function click(element: HTMLButtonElement | undefined): Promise<void> {
  expect(element, "the button under test is not on screen").toBeDefined();
  await act(async () => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

const version = (path: string, keptAt: number): KeptVersion => ({
  path,
  keptAt,
  byteSize: 120
});

describe("the kept versions of a note", () => {
  it("asks before overwriting the note", async () => {
    listNoteVersions.mockResolvedValue([version("/app-data/1.md", 1_700_000_000_000)]);
    const container = await mountList();

    await click(button(container, "Restore this version"));

    // The first press only opens the question.
    expect(restoreNoteVersion).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Replace the note with this version?");
  });

  it("restores once the question is answered", async () => {
    listNoteVersions.mockResolvedValue([version("/app-data/1.md", 1_700_000_000_000)]);
    const container = await mountList();

    await click(button(container, "Restore this version"));
    await click(button(container, "Restore"));

    expect(restoreNoteVersion).toHaveBeenCalledTimes(1);
    expect(onRestored).toHaveBeenCalledTimes(1);
  });

  it("writes nothing when the question is declined", async () => {
    listNoteVersions.mockResolvedValue([version("/app-data/1.md", 1_700_000_000_000)]);
    const container = await mountList();

    await click(button(container, "Restore this version"));
    await click(button(container, "Cancel"));

    expect(restoreNoteVersion).not.toHaveBeenCalled();
    expect(onRestored).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Replace the note with this version?");
  });

  it("says plainly when this device kept nothing, and points elsewhere", async () => {
    // Backups do not travel with the vault — the cost of keeping them out of
    // the folder a sync daemon rewrites. Saying so is the whole point.
    listNoteVersions.mockResolvedValue([]);
    const container = await mountList();

    expect(container.textContent).toContain("No earlier version of this note was kept");
    expect(container.textContent).toContain("History panel");
  });

  it("reports a failed restore instead of claiming success", async () => {
    listNoteVersions.mockResolvedValue([version("/app-data/1.md", 1_700_000_000_000)]);
    restoreNoteVersion.mockRejectedValue(new Error("that version could not be read"));
    const container = await mountList();

    await click(button(container, "Restore this version"));
    await click(button(container, "Restore"));

    expect(onRestored).not.toHaveBeenCalled();
    expect(container.querySelector("[role='alert']")?.textContent).toContain(
      "that version could not be read"
    );
  });

  it("promises the restore is undoable, because it is", async () => {
    listNoteVersions.mockResolvedValue([version("/app-data/1.md", 1_700_000_000_000)]);
    const container = await mountList();

    expect(container.textContent).toContain("Restoring keeps the version it replaces");
  });
});
