// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NativeCommandError } from "../native/commands";
import {
  NOT_RECORDING,
  type HistoryPage,
  type RecordedChange,
  type SyncStatus,
  type VersionDiff
} from "./historyTypes";

const readHistory = vi.fn<
  (
    rootPath: string,
    notePath: string | null,
    limit?: number,
    cursor?: string | null
  ) => Promise<HistoryPage>
>();
const readVersionDiff = vi.fn<
  (rootPath: string, notePath: string, change: string, buffer?: string | null) => Promise<VersionDiff>
>();
// Module-level so a test can put the panel on a live phase without re-mocking.
let syncStatus: SyncStatus = { ...NOT_RECORDING, state: "idle" };
// The latest status callback the hook was handed, so a test can play
// "something new was recorded" after the panel has already rendered.
let statusRefresh: (() => void) | null = null;

vi.mock("./useSyncStatus", () => ({
  useSyncStatus: (_rootPath: string | null, _onConflictChange?: () => void, onStatusChange?: () => void) => {
    statusRefresh = onStatusChange ?? null;
    useEffect(() => onStatusChange?.(), [onStatusChange]);
    return syncStatus;
  }
}));

vi.mock("./syncService", () => ({
  HISTORY_PAGE: 60,
  readHistory,
  readVersionDiff
}));

const { HistoryPanel } = await import("./HistoryPanel");

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const change = (over: Partial<RecordedChange> = {}): RecordedChange => ({
  id: "abc123",
  at: Date.now(),
  message: "Synced from another device",
  notes: [{ path: "Roadmap.md", change: "updated" }],
  source: "local",
  ...over
});

const page = (changes: readonly RecordedChange[], nextCursor: string | null = null): HistoryPage => ({
  changes,
  nextCursor
});

const TEXT_DIFF: VersionDiff = {
  kind: "text",
  change: "abc123",
  notePath: "Roadmap.md",
  text: { current: "first\nnewer\nextra\n", recorded: "first\nolder\n" }
};

beforeEach(() => {
  readHistory.mockReset().mockResolvedValue(page([]));
  readVersionDiff.mockReset().mockResolvedValue(TEXT_DIFF);
  syncStatus = { ...NOT_RECORDING, state: "idle" };
  statusRefresh = null;
  // happy-dom ships an IntersectionObserver stub that never fires, so the
  // badge would wait to be scrolled into view forever. Removing it takes the
  // panel's own "no observer → fetch eagerly" fallback.
  vi.stubGlobal("IntersectionObserver", undefined);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const render = async (
  overrides: {
    rootPath?: string | null;
    note?: string | null;
    currentContents?: string | null;
    onCompare?: (notePath: string, changeId: string) => void;
    onRestore?: (notePath: string, changeId: string) => Promise<void>;
  } = {}
): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <HistoryPanel
        rootPath={overrides.rootPath === undefined ? "/notes" : overrides.rootPath}
        note={overrides.note === undefined ? "Roadmap.md" : overrides.note}
        currentContents={overrides.currentContents ?? null}
        onCompare={overrides.onCompare ?? (() => undefined)}
        onRestore={overrides.onRestore ?? (async () => undefined)}
      />
    )
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

describe("the file's recorded versions", () => {
  it("asks only about the file being inspected", async () => {
    await render();

    expect(readHistory).toHaveBeenCalledWith("/notes", "Roadmap.md");
  });

  it("names the file and counts its versions", async () => {
    readHistory.mockResolvedValue(page([change(), change({ id: "def456" })]));

    const host = await render();

    // The popout owns the "Version history" title — the panel's own heading
    // names the file instead of repeating it.
    expect(host.querySelector('[aria-label="Version history"]')).not.toBeNull();
    expect(host.querySelector("h3")?.textContent).toBe("Roadmap.md");
    expect(host.textContent).toContain("2 versions recorded");
    expect(host.textContent).toContain("Synced from another device");
    expect(host.textContent).toContain("Today");
  });

  it("offers Compare and Restore on every recorded version", async () => {
    readHistory.mockResolvedValue(page([change()]));

    const host = await render();

    expect(button(host, "Compare Diff")).toBeTruthy();
    expect(button(host, "Restore")).toBeTruthy();
  });

  it("waits for the first read before showing an empty state", async () => {
    let finish!: (page: HistoryPage) => void;
    readHistory.mockReturnValue(
      new Promise<HistoryPage>((resolve) => {
        finish = resolve;
      })
    );
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <HistoryPanel
          rootPath="/notes"
          note="Roadmap.md"
          currentContents={null}
          onCompare={() => undefined}
          onRestore={async () => undefined}
        />
      );
    });
    expect(container.textContent).not.toContain("No versions available yet");

    finish(page([]));
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toContain("No versions available yet");
  });

  /// A change that only deleted the file left no version of it behind —
  /// offering one would be offering to delete it again, under a button that
  /// says restore.
  it("offers nothing to compare or restore for a change that deleted the file", async () => {
    readHistory.mockResolvedValue(
      page([change({ notes: [{ path: "Roadmap.md", change: "removed" }] })])
    );

    const host = await render();

    expect(() => button(host, "Compare Diff")).toThrow();
    expect(() => button(host, "Restore")).toThrow();
  });
});

describe("where each version came from", () => {
  it("labels local and imported versions only when a timeline mixes them", async () => {
    readHistory.mockResolvedValue(
      page([
        change({ id: "l1", source: "local", message: "This app's own record" }),
        change({ id: "g1", source: "git", message: "A version from the folder's history" })
      ])
    );

    const host = await render();

    expect(host.textContent).toContain("Recorded here");
    expect(host.textContent).toContain("Git history");
    // Dates and recorded messages survive untouched either way.
    expect(host.textContent).toContain("A version from the folder's history");
  });

  it("says nothing extra when every version is recorded here", async () => {
    readHistory.mockResolvedValue(page([change(), change({ id: "d2" })]));

    const host = await render();

    expect(host.textContent).not.toContain("Recorded here");
    expect(host.textContent).not.toContain("Git history");
  });
});

describe("older versions", () => {
  it("says 'loaded' rather than implying the list is everything", async () => {
    readHistory.mockResolvedValue(page([change()], "cursor-1"));

    const host = await render();

    expect(host.textContent).toContain("1 version loaded");
    expect(host.textContent).not.toContain("1 version recorded");
  });

  it("appends the next page through the returned cursor", async () => {
    readHistory
      .mockResolvedValueOnce(page([change()], "cursor-1"))
      .mockResolvedValueOnce(page([change({ id: "old1", message: "A much older record" })]));

    const host = await render();
    expect(button(host, "Load older versions")).toBeTruthy();

    await act(async () => button(host, "Load older versions").click());

    expect(readHistory).toHaveBeenLastCalledWith("/notes", "Roadmap.md", 60, "cursor-1");
    expect(host.textContent).toContain("Synced from another device");
    expect(host.textContent).toContain("A much older record");
    expect(host.textContent).toContain("2 versions recorded");
    // No cursor came back — there is nothing older to ask for.
    expect(() => button(host, "Load older versions")).toThrow();
  });

  it("asks for one page at a time however fast the button is hit", async () => {
    let finishPage!: (page: HistoryPage) => void;
    readHistory
      .mockResolvedValueOnce(page([change()], "cursor-1"))
      .mockReturnValueOnce(
        new Promise<HistoryPage>((resolve) => {
          finishPage = resolve;
        })
      );

    const host = await render();
    await act(async () => button(host, "Load older versions").click());

    // While the request is out the button is disabled and says so.
    const again = button(host, "Loading older versions");
    expect(again.disabled).toBe(true);
    await act(async () => again.click());
    expect(readHistory).toHaveBeenCalledTimes(2);

    finishPage(page([change({ id: "old1" })]));
    await act(async () => {
      await Promise.resolve();
    });
    expect(host.textContent).toContain("2 versions recorded");
  });

  it("keeps the loaded rows and the cursor when a page fails, so retry asks again", async () => {
    readHistory
      .mockResolvedValueOnce(page([change()], "cursor-1"))
      .mockRejectedValueOnce(
        new NativeCommandError({
          code: "sync.history_read_failed",
          message: "The older versions could not be read."
        })
      );

    const host = await render();
    await act(async () => button(host, "Load older versions").click());

    expect(host.querySelector('[role="alert"]')?.textContent).toContain("could not be read");
    // What was already shown is untouched, and the same cursor stands.
    expect(host.textContent).toContain("Today");
    expect(button(host, "Load older versions")).toBeTruthy();

    readHistory.mockResolvedValueOnce(page([change({ id: "old1", message: "The deeper record" })]));
    await act(async () => button(host, "Load older versions").click());

    expect(readHistory).toHaveBeenLastCalledWith("/notes", "Roadmap.md", 60, "cursor-1");
    expect(host.textContent).toContain("The deeper record");
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it("recovers an expired cursor with Refresh, which starts a fresh first page", async () => {
    readHistory
      .mockResolvedValueOnce(page([change()], "cursor-1"))
      .mockRejectedValueOnce(
        new NativeCommandError({
          code: "sync.history_cursor_expired",
          message: "Those older versions are no longer kept."
        })
      );

    const host = await render();
    await act(async () => button(host, "Load older versions").click());
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("no longer kept");

    readHistory.mockResolvedValueOnce(page([change({ id: "fresh1", message: "The fresh read" })]));
    await act(async () => button(host, "Refresh").click());

    // A refresh is a new first page — no cursor is sent with it.
    expect(readHistory).toHaveBeenLastCalledWith("/notes", "Roadmap.md");
    expect(host.textContent).toContain("The fresh read");
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it("drops an older page that lands after a fresh first page", async () => {
    let finishOlder!: (page: HistoryPage) => void;
    readHistory
      .mockResolvedValueOnce(page([change()], "cursor-1"))
      .mockReturnValueOnce(
        new Promise<HistoryPage>((resolve) => {
          finishOlder = resolve;
        })
      )
      .mockResolvedValueOnce(page([change({ id: "fresh", message: "The refreshed first page" })]));

    const host = await render();
    await act(async () => button(host, "Load older versions").click());

    // A status event re-reads the first page while the older page is out.
    await act(async () => statusRefresh?.());
    await act(async () => finishOlder(page([change({ id: "stale", message: "A stale page" })])));

    expect(host.textContent).toContain("The refreshed first page");
    expect(host.textContent).not.toContain("A stale page");
  });

  /// While a fresh first page is still out, the cursor on screen belongs to
  /// the previous list — a page cut from it now would append old roots onto
  /// the refreshed rows. The refusal lives on a ref precisely for this tick.
  it("refuses a page request while a fresh first page is in flight", async () => {
    let finishRefresh!: (page: HistoryPage) => void;
    readHistory
      .mockResolvedValueOnce(page([change()], "cursor-1"))
      .mockReturnValueOnce(
        new Promise<HistoryPage>((resolve) => {
          finishRefresh = resolve;
        })
      );

    const host = await render();
    // A status event starts a new first page and leaves it pending.
    await act(async () => statusRefresh?.());
    await act(async () => button(host, "Load older versions").click());

    // The click was refused: only the mount read and the refresh went out.
    expect(readHistory).toHaveBeenCalledTimes(2);
    expect(button(host, "Load older versions").disabled).toBe(true);

    await act(async () =>
      finishRefresh(page([change({ id: "r2", message: "The refreshed page" })], "cursor-2"))
    );
    expect(button(host, "Load older versions").disabled).toBe(false);

    readHistory.mockResolvedValueOnce(
      page([change({ id: "old2", message: "Older under the new first page" })])
    );
    await act(async () => button(host, "Load older versions").click());

    // The page was cut from the new cursor, never the retired one.
    expect(readHistory).toHaveBeenLastCalledWith("/notes", "Roadmap.md", 60, "cursor-2");
    expect(host.textContent).toContain("The refreshed page");
    expect(host.textContent).toContain("Older under the new first page");
  });

  /// A stale refresh resolving must not clear the pending flag that a newer
  /// refresh is still holding — the button stays refused until that newer
  /// first page lands.
  it("keeps refusing pages while the newer of two refreshes is in flight", async () => {
    const reads: ((page: HistoryPage) => void)[] = [];
    readHistory
      .mockResolvedValueOnce(page([change()], "cursor-1"))
      .mockImplementation(
        () =>
          new Promise<HistoryPage>((resolve) => {
            reads.push(resolve);
          })
      );

    const host = await render();
    await act(async () => statusRefresh?.());
    await act(async () => statusRefresh?.());

    // The earlier refresh answers first — stale, so it clears nothing.
    await act(async () =>
      reads[0]?.(page([change({ id: "stale", message: "A stale first page" })], "cursor-stale"))
    );
    expect(host.textContent).not.toContain("A stale first page");
    expect(button(host, "Load older versions").disabled).toBe(true);
    await act(async () => button(host, "Load older versions").click());
    expect(readHistory).toHaveBeenCalledTimes(3);

    // The newer refresh lands and paging resumes from its cursor.
    await act(async () =>
      reads[1]?.(page([change({ id: "newest", message: "The newest first page" })], "cursor-2"))
    );
    expect(host.textContent).toContain("The newest first page");
    expect(button(host, "Load older versions").disabled).toBe(false);
  });

  it("keeps the accepted rows and cursor when a refresh fails, then recovers", async () => {
    readHistory
      .mockResolvedValueOnce(page([change()], "cursor-1"))
      .mockRejectedValueOnce(new Error("nope"));

    const host = await render();
    await act(async () => statusRefresh?.());

    expect(host.querySelector('[role="alert"]')?.textContent).toBeTruthy();
    // The accepted page and its cursor stand, and paging is allowed again.
    expect(host.textContent).toContain("Synced from another device");
    expect(button(host, "Load older versions").disabled).toBe(false);

    readHistory.mockResolvedValueOnce(page([change({ id: "old1", message: "The deeper record" })]));
    await act(async () => button(host, "Load older versions").click());

    expect(readHistory).toHaveBeenLastCalledWith("/notes", "Roadmap.md", 60, "cursor-1");
    expect(host.textContent).toContain("The deeper record");
  });

  it("keeps an earlier first-page read from overwriting a newer one", async () => {
    const reads: ((page: HistoryPage) => void)[] = [];
    readHistory.mockImplementation(
      () =>
        new Promise<HistoryPage>((resolve) => {
          reads.push(resolve);
        })
    );

    const host = await render();
    await act(async () => statusRefresh?.());

    // The newer refresh answers first…
    await act(async () => reads[1]?.(page([change({ id: "newest", message: "The newest read" })])));
    expect(host.textContent).toContain("The newest read");

    // …and the older read landing after it is ignored.
    await act(async () => reads[0]?.(page([change({ id: "old", message: "A stale read" })])));
    expect(host.textContent).toContain("The newest read");
    expect(host.textContent).not.toContain("A stale read");
  });
});

describe("the difference each revision makes", () => {
  it("fetches the comparison lazily per card and counts it", async () => {
    // happy-dom has no IntersectionObserver, so the badge loads eagerly here —
    // the laziness is about not blocking the timeline, which eager fallback keeps.
    readHistory.mockResolvedValue(page([change()]));

    const host = await render();

    expect(readVersionDiff).toHaveBeenCalledWith("/notes", "Roadmap.md", "abc123", null);
    // Restore direction: current "first\nnewer\nextra\n" → recorded
    // "first\nolder\n" adds one line and removes two: +1 -2
    expect(host.textContent).toContain("+1 -2");
  });

  it("compares against the open document's live contents, not a save", async () => {
    readHistory.mockResolvedValue(page([change()]));

    const host = await render({ currentContents: "first\nolder\nsame\n" });

    expect(readVersionDiff).toHaveBeenCalledWith("/notes", "Roadmap.md", "abc123", "first\nolder\nsame\n");
    // live "first\nolder\nsame\n" → recorded "first\nolder\n": restoring
    // removes the extra line: +0 -1
    expect(host.textContent).toContain("+0 -1");
  });

  it("says so plainly for a file that is not text", async () => {
    readHistory.mockResolvedValue(page([change()]));
    readVersionDiff.mockResolvedValue({ ...TEXT_DIFF, kind: "binary", text: null });

    const host = await render();

    expect(host.textContent).toContain("not text");
    expect(button(host, "Compare Diff")).toBeTruthy();
    expect(button(host, "Restore")).toBeTruthy();
  });
});

describe("comparing and putting a version back", () => {
  const renderForActions = async (
    onRestore: (notePath: string, changeId: string) => Promise<void> = async () => undefined
  ) => {
    const onCompare = vi.fn();
    readHistory.mockResolvedValue(page([change()]));
    const host = await render({ onCompare, onRestore });
    return { host, onCompare };
  };

  it("opens the comparison through the shell with the version's timestamp", async () => {
    const onCompare = vi.fn();
    const at = Date.UTC(2026, 7, 18, 12, 0, 0);
    readHistory.mockResolvedValue(page([change({ at })]));
    const host = await render({ onCompare });

    await act(async () => button(host, "Compare Diff").click());

    // The timestamp travels so the tab can name the version being restored.
    expect(onCompare).toHaveBeenCalledWith("Roadmap.md", "abc123", at);
  });

  it("restores through the shell and says it worked", async () => {
    const onRestore = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const { host } = await renderForActions(onRestore);

    await act(async () => button(host, "Restore").click());

    expect(onRestore).toHaveBeenCalledWith("Roadmap.md", "abc123");
    expect(host.querySelector('[role="status"]')?.textContent).toContain("Roadmap.md");
  });

  /// A refused restore wrote nothing, and the list has to go on saying so.
  it("reports a refusal without dropping the list", async () => {
    const onRestore = vi.fn<() => Promise<void>>().mockRejectedValue(
      new NativeCommandError({ code: "sync.note_store_failed", message: "The saved version could not be put back." })
    );
    const { host } = await renderForActions(onRestore);

    await act(async () => button(host, "Restore").click());

    expect(host.querySelector('[role="alert"]')?.textContent).toContain("put back");
    expect(host.textContent).toContain("Check this computer has space left");
    expect(host.textContent).toContain("Today");
  });

  it("passes through the shell's own refusal to overwrite unsaved edits", async () => {
    const onRestore = vi
      .fn<() => Promise<void>>()
      .mockRejectedValue(new Error("Save the current file before restoring an earlier version."));
    const { host } = await renderForActions(onRestore);

    await act(async () => button(host, "Restore").click());

    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Save the current file");
  });

  /// A different file is a different session, so a restore still in flight
  /// for the old file resolves onto an unmounted component — neither its
  /// re-read list nor its notice may land in the new file's timeline.
  it("keeps a pending restore's results out of the next file", async () => {
    let finishRestore: () => void = () => undefined;
    let finishOtherRead: (page: HistoryPage) => void = () => undefined;
    const onRestore = vi.fn<() => Promise<void>>().mockReturnValue(
      new Promise((resolve) => {
        finishRestore = resolve;
      })
    );
    readHistory.mockImplementation(async (_rootPath, notePath) =>
      notePath === "Other.md"
        ? new Promise<HistoryPage>((resolve) => {
            finishOtherRead = resolve;
          })
        : page([change()])
    );
    const host = document.createElement("div");
    container = host;
    document.body.append(host);
    root = createRoot(host);
    let note = "Roadmap.md";
    const Panel = () => (
      <HistoryPanel
        rootPath="/notes"
        note={note}
        currentContents={null}
        onCompare={() => undefined}
        onRestore={onRestore}
      />
    );

    await act(async () => root?.render(<Panel />));
    await act(async () => button(host, "Restore").click());
    expect(onRestore).toHaveBeenCalledWith("Roadmap.md", "abc123");

    // Inspect another file while the restore is still in flight.
    note = "Other.md";
    await act(async () => root?.render(<Panel />));
    expect(host.textContent).not.toContain("Synced from another device");

    // The old restore now finishes, then the new file's own read lands.
    await act(async () => finishRestore());
    finishOtherRead(page([change({ id: "x1", message: "Other file's own record" })]));
    await act(async () => {
      await Promise.resolve();
    });

    expect(host.textContent).toContain("Other file's own record");
    expect(host.querySelector('[role="status"]')).toBeNull();
  });

  /// The workspace is part of the session key too: a first page still in
  /// flight for one root must not land in the next root's timeline.
  it("keeps a pending first page out of the next workspace", async () => {
    let finishRead: (page: HistoryPage) => void = () => undefined;
    readHistory.mockImplementation(async (rootPath) =>
      rootPath === "/notes"
        ? new Promise<HistoryPage>((resolve) => {
            finishRead = resolve;
          })
        : page([change({ id: "other-root", message: "Other workspace's record" })])
    );
    const host = document.createElement("div");
    container = host;
    document.body.append(host);
    root = createRoot(host);
    let rootPath = "/notes";
    const Panel = () => (
      <HistoryPanel
        rootPath={rootPath}
        note="Roadmap.md"
        currentContents={null}
        onCompare={() => undefined}
        onRestore={async () => undefined}
      />
    );

    await act(async () => root?.render(<Panel />));

    rootPath = "/other";
    await act(async () => root?.render(<Panel />));
    expect(host.textContent).toContain("Other workspace's record");

    await act(async () => finishRead(page([change({ message: "The wrong workspace's read" })])));
    expect(host.textContent).not.toContain("The wrong workspace's read");
  });
});

describe("when there is nothing to inspect", () => {
  it("explains a closed workspace rather than showing an empty list", async () => {
    const host = await render({ rootPath: null });

    expect(host.textContent).toContain("No workspace open");
    expect(readHistory).not.toHaveBeenCalled();
  });

  it("explains a missing file rather than showing an empty list", async () => {
    const host = await render({ note: null });

    expect(host.textContent).toContain("No file open");
    expect(readHistory).not.toHaveBeenCalled();
  });

  it("says so plainly when no versions are available yet", async () => {
    const host = await render();

    expect(host.textContent).toContain("No versions available yet");
    // Factual copy: nothing about the file only ever being saved once.
    expect(host.textContent).not.toContain("only ever been saved once");
  });

  it("explains itself and offers a fresh read when the first read fails", async () => {
    readHistory.mockRejectedValueOnce(new Error("nope"));

    const host = await render();

    expect(host.querySelector('[role="alert"]')?.textContent).toBeTruthy();
    expect(host.textContent).not.toContain("No versions available yet");

    readHistory.mockResolvedValueOnce(page([change()]));
    await act(async () => button(host, "Refresh").click());

    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.textContent).toContain("1 version recorded");
  });
});
