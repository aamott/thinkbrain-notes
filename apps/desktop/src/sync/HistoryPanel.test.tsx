// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NativeCommandError } from "../native/commands";
import { NOT_RECORDING, type ConflictRate, type RecordedChange, type Synced } from "./historyTypes";

const readHistory = vi.fn<(rootPath: string, notePath: string | null) => Promise<readonly RecordedChange[]>>();
const syncNow = vi.fn<(rootPath: string) => Promise<Synced>>();
/** What the settings say this folder is kept in step with, if anything. */
let destination = "";
const readConflictRate = vi.fn<(rootPath: string) => Promise<ConflictRate>>();
const restoreVersion = vi.fn<(rootPath: string, notePath: string, change: string) => Promise<void>>();
const subscribeToSyncStatus = vi.fn<() => Promise<() => void>>();

vi.mock("./useSyncStatus", () => ({
  useSyncStatus: () => ({ ...NOT_RECORDING, state: "idle" })
}));

vi.mock("./syncService", () => ({
  readHistory,
  readConflictRate,
  restoreVersion,
  subscribeToSyncStatus,
  syncNow
}));

vi.mock("../settings/settingsStore", () => ({
  useSettingsStore: (select: (state: unknown) => unknown) =>
    select({ workspaceValues: { "sync.destination": destination } })
}));

const { HistoryPanel } = await import("./HistoryPanel");

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const change = (over: Partial<RecordedChange> = {}): RecordedChange => ({
  id: "abc123",
  at: Date.now(),
  message: "Sync 2026-08-17 09:31 — 2 notes changed",
  notes: [
    { path: "journal/Meeting Notes.md", change: "updated" },
    { path: "Roadmap.md", change: "added" }
  ],
  ...over
});

beforeEach(() => {
  readHistory.mockReset().mockResolvedValue([]);
  readConflictRate.mockReset().mockResolvedValue({ decisions: 0, settled: 0, recorded: 0 });
  restoreVersion.mockReset().mockResolvedValue(undefined);
  subscribeToSyncStatus.mockReset().mockResolvedValue(() => undefined);
  syncNow.mockReset().mockResolvedValue({
    broughtDown: 0,
    askedAbout: 0,
    sent: 0,
    landed: { state: "moved" }
  });
  destination = "";
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const render = async (note: string | null = null, onShowEverything = vi.fn()): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(<HistoryPanel rootPath="/notes" note={note} onShowEverything={onShowEverything} />)
  );
  return container;
};

const button = (host: HTMLElement, text: string): HTMLButtonElement => {
  const found = [...host.querySelectorAll("button")].find((candidate) =>
    candidate.textContent?.includes(text)
  );
  if (!found) throw new Error(`No button reading "${text}" among: ${host.textContent}`);
  return found;
};

describe("the whole workspace's history", () => {
  it("says so plainly when nothing has been saved", async () => {
    const host = await render();

    expect(host.textContent).toContain("Nothing saved yet");
  });

  it("waits for the first read before showing an empty state", async () => {
    let finish!: (changes: readonly RecordedChange[]) => void;
    const pending = new Promise<readonly RecordedChange[]>((resolve) => {
      finish = resolve;
    });
    readHistory.mockReturnValue(pending);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(() => {
      root?.render(<HistoryPanel rootPath="/notes" note={null} onShowEverything={() => undefined} />);
    });
    expect(container.textContent).not.toContain("Nothing saved yet");

    finish([]);
    await act(async () => {
      await pending;
    });
    expect(container.textContent).toContain("Nothing saved yet");
  });

  it("dates each saved change and counts what it touched", async () => {
    readHistory.mockResolvedValue([change()]);

    const host = await render();

    expect(host.textContent).toContain("Today");
    expect(host.textContent).toContain("2 notes changed");
  });

  /// The list is a summary until asked. Naming every note in every change would
  /// make the one the user is looking for harder to find, not easier.
  it("names the notes only once a change is opened", async () => {
    readHistory.mockResolvedValue([change()]);

    const host = await render();
    expect(host.textContent).not.toContain("Meeting Notes.md");

    await act(async () => button(host, "2 notes changed").click());
    expect(host.textContent).toContain("Meeting Notes.md");
  });

  /// The escape hatch for anyone who would rather read the record itself.
  it("keeps what was written down available behind a disclosure", async () => {
    readHistory.mockResolvedValue([change()]);

    const host = await render();
    await act(async () => button(host, "2 notes changed").click());

    expect(host.textContent).toContain("Sync 2026-08-17 09:31 — 2 notes changed");
  });

  it("reports how often this folder has needed a decision", async () => {
    readHistory.mockResolvedValue([change()]);
    readConflictRate.mockResolvedValue({ decisions: 2, settled: 0, recorded: 340 });

    const host = await render();

    expect(host.textContent).toContain("340");
    expect(host.textContent).toContain("2 of them");
  });

  it("explains itself rather than showing an empty list when it cannot read", async () => {
    readHistory.mockRejectedValue(new Error("nope"));

    const host = await render();

    expect(host.querySelector('[role="alert"]')?.textContent).toBeTruthy();
  });
});

describe("one note's earlier versions", () => {
  it("asks only about that note", async () => {
    readHistory.mockResolvedValue([change({ notes: [{ path: "Roadmap.md", change: "updated" }] })]);

    await render("Roadmap.md");

    expect(readHistory).toHaveBeenCalledWith("/notes", "Roadmap.md");
  });

  /// A single note's versions have nothing to fold away, so they are open.
  it("shows every version without asking twice", async () => {
    readHistory.mockResolvedValue([change({ notes: [{ path: "Roadmap.md", change: "updated" }] })]);

    const host = await render("Roadmap.md");

    expect(host.textContent).toContain("Roadmap.md");
    expect(button(host, "Put this version back")).toBeTruthy();
  });

  it("offers the way back to the whole history", async () => {
    const onShowEverything = vi.fn();
    readHistory.mockResolvedValue([]);

    const host = await render("Roadmap.md", onShowEverything);
    await act(async () => button(host, "Show everything instead").click());

    expect(onShowEverything).toHaveBeenCalled();
  });
});

describe("putting a version back", () => {
  const renderRoadmapForRestore = async () => {
    readHistory.mockResolvedValue([change({ notes: [{ path: "Roadmap.md", change: "updated" }] })]);
    const host = await render("Roadmap.md");
    await act(async () => button(host, "Put this version back").click());
    return host;
  };

  it("names the note and the change it came from", async () => {
    await renderRoadmapForRestore();
    expect(restoreVersion).toHaveBeenCalledWith("/notes", "Roadmap.md", "abc123");
  });

  it("says it worked, and says the earlier text is still there", async () => {
    const host = await renderRoadmapForRestore();
    expect(host.querySelector('[role="status"]')?.textContent).toContain("Roadmap.md");
  });

  /// A refused restore wrote nothing, and the list has to go on saying so.
  it("reports a refusal without dropping the list", async () => {
    restoreVersion.mockRejectedValue(new Error("refused"));
    const host = await renderRoadmapForRestore();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Nothing was changed");
    expect(host.textContent).toContain("Roadmap.md");
  });

  it("adds the recovery hint from a native failure", async () => {
    restoreVersion.mockRejectedValue(
      new NativeCommandError({
        code: "sync.note_store_failed",
        message: "The saved version could not be put back."
      })
    );
    const host = await renderRoadmapForRestore();
    expect(host.textContent).toContain("Check this computer has space left");
  });

  it("logs a failed history subscription instead of leaving it unhandled", async () => {
    const cause = new Error("listen failed");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    subscribeToSyncStatus.mockRejectedValue(cause);

    await render();

    expect(log).toHaveBeenCalledWith("[sync] could not subscribe to history updates", cause);
    log.mockRestore();
  });

  /// A change that only deleted a note left no text to put back — offering one
  /// would be offering to delete it again, under a button that says restore.
  it("offers nothing to put back for a note that was deleted", async () => {
    readHistory.mockResolvedValue([change({ notes: [{ path: "Gone.md", change: "removed" }] })]);

    const host = await render();
    await act(async () => button(host, "1 note deleted").click());

    expect(host.textContent).toContain("deleted");
    expect(() => button(host, "Put this version back")).toThrow();
  });
});

describe("bringing a folder in step with another device", () => {
  /// Offering to sync a folder that syncs nowhere is a button that can only
  /// fail, and someone would reasonably read it as a thing they had set up.
  it("is not offered at all when this folder syncs nowhere", async () => {
    const host = await render();

    expect(host.textContent).not.toContain("in step");
  });

  it("is offered once somewhere has been named", async () => {
    destination = "https://example.test/notes.git";

    const host = await render();

    expect(button(host, "Bring these notes in step now")).toBeTruthy();
  });

  it("says what arrived, and reads the list again so it shows", async () => {
    destination = "https://example.test/notes.git";
    syncNow.mockResolvedValue({
      broughtDown: 2,
      askedAbout: 0,
      sent: 3,
      landed: { state: "moved" }
    });
    const host = await render();
    readHistory.mockResolvedValue([change()]);

    await act(async () => button(host, "Bring these notes in step now").click());

    expect(syncNow).toHaveBeenCalledWith("/notes");
    expect(host.textContent).toContain("2 notes arrived");
    expect(host.textContent).toContain("Today");
  });

  /// A sync writes to someone's notes. A failure that scrolled past silently
  /// would leave them believing it worked.
  it("says so when it could not happen, and says nothing changed", async () => {
    destination = "https://example.test/notes.git";
    syncNow.mockRejectedValue(new Error("no"));

    const host = await render();
    await act(async () => button(host, "Bring these notes in step now").click());

    expect(host.textContent).toContain("could not be brought in step");
    expect(host.textContent).toContain("Nothing was changed");
  });
});
