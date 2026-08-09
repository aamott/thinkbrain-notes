import { describe, expect, it, vi } from "vitest";

import { createJournalService } from "./journalService";
import type { ExtensionNote } from "../extensions/extensionWorkspace";

/**
 * The journal service, driven through the extension workspace API (D68).
 *
 * The clock is injected so backfill and collision behavior are deterministic —
 * D61 makes "what time is written" a decision, not an accident.
 */

const at = (iso: string) => () => new Date(iso);

const setup = (options: { notes?: readonly ExtensionNote[]; root?: string; now?: () => Date } = {}) => {
  const created: { path: string; contents?: string }[] = [];
  const opened: string[] = [];
  const workspace = {
    rootPath: () => "/vault",
    listNotes: vi.fn(async () => options.notes ?? []),
    createNote: vi.fn(async (path: string, contents?: string) => {
      created.push({ path, contents });
    }),
    openNote: vi.fn(async (path: string) => {
      opened.push(path);
    }),
    readNote: vi.fn(async () => "")
  };
  const service = createJournalService({
    workspace: workspace as never,
    root: () => options.root ?? "journal",
    now: options.now ?? at("2026-08-07T13:07:30")
  });
  return { service, workspace, created, opened };
};

const note = (relativePath: string, updatedAt: number | null = 0): ExtensionNote => ({
  relativePath,
  updatedAt
});

describe("createEntry", () => {
  it("creates today's entry at the current clock time with a date-only frontmatter", async () => {
    const { service, created } = setup();

    const path = await service.createEntry();

    expect(path).toBe("journal/2026/08/2026-08-07-1307.md");
    expect(created).toEqual([
      { path: "journal/2026/08/2026-08-07-1307.md", contents: "---\ndate: 2026-08-07\n---\n\n" }
    ]);
  });

  it("always creates a new file, even when one exists for today", async () => {
    // D18: "New entry" never reopens or appends.
    const { service, created } = setup({ notes: [note("journal/2026/08/2026-08-07-1307.md")] });

    const path = await service.createEntry();

    expect(path).toBe("journal/2026/08/2026-08-07-1307-2.md");
    expect(created).toHaveLength(1);
  });

  it("stamps a backfilled entry with the current clock time, not midnight", async () => {
    // D61: the user supplies the date; the time is when they actually wrote it.
    const { service, created } = setup();

    const path = await service.createEntry({ year: 2026, month: 3, day: 1 });

    expect(path).toBe("journal/2026/03/2026-03-01-1307.md");
    expect(created[0]?.contents).toContain("date: 2026-03-01");
  });

  it("honours a configured journal root", async () => {
    const { service } = setup({ root: "notes/diary" });

    await expect(service.createEntry()).resolves.toBe(
      "notes/diary/2026/08/2026-08-07-1307.md"
    );
  });

  it("only considers entries in the journal folder when resolving collisions", async () => {
    const { service, workspace } = setup();

    await service.createEntry();

    expect(workspace.listNotes).toHaveBeenCalledWith("journal");
  });
});

describe("listEntries", () => {
  it("returns dated entries in chronological order", async () => {
    const { service } = setup({
      notes: [
        note("journal/2026/08/2026-08-07-1307.md"),
        note("journal/2026/08/2026-08-06.md"),
        note("journal/2026/08/2026-08-07-0900.md")
      ]
    });

    const { entries } = await service.listEntries();

    expect(entries.map((entry) => entry.relativePath)).toEqual([
      "journal/2026/08/2026-08-06.md",
      "journal/2026/08/2026-08-07-0900.md",
      "journal/2026/08/2026-08-07-1307.md"
    ]);
  });

  it("routes an unparseable name to undated, ordered by modified time", async () => {
    // D36/D38: never guessed, never hidden, ordered by mtime among itself.
    const { service } = setup({
      notes: [
        note("journal/ideas.md", 100),
        note("journal/2026/08/2026-08-07-1307.md", 5),
        note("journal/01-02-2026.md", 300)
      ]
    });

    const { entries, undated } = await service.listEntries();

    expect(entries).toHaveLength(1);
    expect(undated.map((entry) => entry.relativePath)).toEqual([
      "journal/01-02-2026.md",
      "journal/ideas.md"
    ]);
  });

  it("asks only for notes under the journal root", async () => {
    const { service, workspace } = setup({ root: "diary" });

    await service.listEntries();

    expect(workspace.listNotes).toHaveBeenCalledWith("diary");
  });
});

describe("openToday", () => {
  it("opens today's most recent entry when one exists", async () => {
    const { service, opened, created } = setup({
      notes: [
        note("journal/2026/08/2026-08-07-0900.md"),
        note("journal/2026/08/2026-08-07-1300.md")
      ]
    });

    await service.openToday();

    expect(opened).toEqual(["journal/2026/08/2026-08-07-1300.md"]);
    expect(created).toEqual([]);
  });

  it("creates and opens one when today has no entry", async () => {
    const { service, opened, created } = setup({
      notes: [note("journal/2026/08/2026-08-06-0900.md")]
    });

    await service.openToday();

    expect(created).toHaveLength(1);
    expect(opened).toEqual(["journal/2026/08/2026-08-07-1307.md"]);
  });
});

describe("failures", () => {
  it("reports no workspace with the approved copy", async () => {
    // D63: errors name what failed and offer the fix.
    const { service } = setup();
    const workspaceless = createJournalService({
      workspace: { rootPath: () => null } as never,
      root: () => "journal",
      now: at("2026-08-07T13:07:30")
    });
    expect(service).toBeDefined();

    await expect(workspaceless.listEntries()).rejects.toThrow(
      "Open a folder to start journaling."
    );
  });

  it("reports an invalid journal root with the approved copy", async () => {
    const invalid = setup({ root: "../outside" });

    await expect(invalid.service.listEntries()).rejects.toThrow(
      "The journal folder setting isn't a valid path."
    );
  });

  it("reports an unreadable journal folder with the approved copy", async () => {
    const { service, workspace } = setup();
    workspace.listNotes.mockRejectedValueOnce(new Error("EACCES"));

    await expect(service.listEntries()).rejects.toThrow("Can't read the journal folder.");
  });
});

describe("creating opens what it created", () => {
  it("opens the new entry, because the point of creating one is to write in it", async () => {
    const { service, opened } = setup();

    const created = await service.createEntry();

    expect(opened).toEqual([created]);
  });
});

describe("first-line previews", () => {
  it("returns the first line of prose, skipping the frontmatter", async () => {
    const { service, workspace } = setup();
    workspace.readNote.mockResolvedValue(
      "---\ndate: 2026-08-07\n---\n\nBread needed more salt.\n"
    );

    expect(await service.readPreview("journal/x.md")).toBe("Bread needed more salt.");
  });

  it("returns null for an entry with no prose yet", async () => {
    const { service, workspace } = setup();
    workspace.readNote.mockResolvedValue("---\ndate: 2026-08-07\n---\n\n");

    expect(await service.readPreview("journal/x.md")).toBeNull();
  });

  it("returns null rather than failing when the note cannot be read", async () => {
    const { service, workspace } = setup();
    workspace.readNote.mockRejectedValue(new Error("gone"));

    expect(await service.readPreview("journal/x.md")).toBeNull();
  });
});

describe("a listing that has not caught up", () => {
  /**
   * `listNotes` is a directory scan and `createNote` is a separate native call.
   * On the synced folders this app targets — OneDrive, Syncthing — a listing can
   * lag a write it has already accepted, and the journal must not respond by
   * writing a second entry for the same day.
   */
  const stale = (options: { now?: () => Date } = {}) => {
    const listed: ExtensionNote[] = [];
    const created: string[] = [];
    const opened: string[] = [];
    const workspace = {
      rootPath: () => "/vault",
      // Deliberately never reports what was written: the worst case, not a race
      // window that happens to be narrow today.
      listNotes: vi.fn(async () => [...listed]),
      createNote: vi.fn(async (path: string) => {
        created.push(path);
      }),
      openNote: vi.fn(async (path: string) => {
        opened.push(path);
      }),
      readNote: vi.fn(async () => "")
    };
    const service = createJournalService({
      workspace: workspace as never,
      root: () => "journal",
      now: options.now ?? at("2026-08-07T13:07:30")
    });
    return { service, created, opened };
  };

  it("opens the entry it just made rather than making another", async () => {
    const { service, created, opened } = stale();

    const first = await service.createEntry();
    const second = await service.openToday();

    expect(created).toHaveLength(1);
    expect(second).toBe(first);
    expect(opened.at(-1)).toBe(first);
  });

  it("gives a same-minute second entry its own name", async () => {
    const { service, created } = stale();

    await service.createEntry();
    await service.createEntry();

    expect(created).toHaveLength(2);
    expect(created[0]).not.toBe(created[1]);
  });

  it("answers two rapid Today clicks with one entry", async () => {
    const { service, created } = stale();

    const [first, second] = await Promise.all([service.openToday(), service.openToday()]);

    expect(created).toHaveLength(1);
    expect(first).toBe(second);
  });

  it("still creates a fresh entry for a different day", async () => {
    const { service, created } = stale();

    await service.createEntry();
    await service.createEntry({ year: 2026, month: 8, day: 6 });

    expect(created).toHaveLength(2);
  });
});
