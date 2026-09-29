// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NativeCommandError } from "../native/commands";
import {
  NOT_RECORDING,
  type RecordedChange,
  type SyncStatus,
  type VersionDiff
} from "./historyTypes";

const readHistory = vi.fn<(rootPath: string, notePath: string | null) => Promise<readonly RecordedChange[]>>();
const readVersionDiff = vi.fn<
  (rootPath: string, notePath: string, change: string, buffer?: string | null) => Promise<VersionDiff>
>();
// Module-level so a test can put the panel on a live phase without re-mocking.
let syncStatus: SyncStatus = { ...NOT_RECORDING, state: "idle" };

vi.mock("./useSyncStatus", () => ({
  useSyncStatus: (_rootPath: string | null, _onConflictChange?: () => void, onStatusChange?: () => void) => {
    useEffect(() => onStatusChange?.(), [onStatusChange]);
    return syncStatus;
  }
}));

vi.mock("./syncService", () => ({
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
  ...over
});

const TEXT_DIFF: VersionDiff = {
  kind: "text",
  change: "abc123",
  notePath: "Roadmap.md",
  text: { current: "first\nnewer\nextra\n", recorded: "first\nolder\n" }
};

beforeEach(() => {
  readHistory.mockReset().mockResolvedValue([]);
  readVersionDiff.mockReset().mockResolvedValue(TEXT_DIFF);
  syncStatus = { ...NOT_RECORDING, state: "idle" };
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

  it("names the file and counts its revisions", async () => {
    readHistory.mockResolvedValue([change(), change({ id: "def456" })]);

    const host = await render();

    // The popout owns the "Version history" title — the panel's own heading
    // names the file instead of repeating it.
    expect(host.querySelector('[aria-label="Version history"]')).not.toBeNull();
    expect(host.querySelector("h3")?.textContent).toBe("Roadmap.md");
    expect(host.textContent).toContain("2 revisions recorded");
    expect(host.textContent).toContain("Synced from another device");
    expect(host.textContent).toContain("Today");
  });

  it("offers Compare and Restore on every recorded version", async () => {
    readHistory.mockResolvedValue([change()]);

    const host = await render();

    expect(button(host, "Compare Diff")).toBeTruthy();
    expect(button(host, "Restore")).toBeTruthy();
  });

  it("waits for the first read before showing an empty state", async () => {
    let finish!: (changes: readonly RecordedChange[]) => void;
    readHistory.mockReturnValue(
      new Promise<readonly RecordedChange[]>((resolve) => {
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
    expect(container.textContent).not.toContain("No earlier versions yet");

    finish([]);
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toContain("No earlier versions yet");
  });

  /// A change that only deleted the file left no version of it behind —
  /// offering one would be offering to delete it again, under a button that
  /// says restore.
  it("offers nothing to compare or restore for a change that deleted the file", async () => {
    readHistory.mockResolvedValue([
      change({ notes: [{ path: "Roadmap.md", change: "removed" }] })
    ]);

    const host = await render();

    expect(() => button(host, "Compare Diff")).toThrow();
    expect(() => button(host, "Restore")).toThrow();
  });
});

describe("the difference each revision makes", () => {
  it("fetches the comparison lazily per card and counts it", async () => {
    // happy-dom has no IntersectionObserver, so the badge loads eagerly here —
    // the laziness is about not blocking the timeline, which eager fallback keeps.
    readHistory.mockResolvedValue([change()]);

    const host = await render();

    expect(readVersionDiff).toHaveBeenCalledWith("/notes", "Roadmap.md", "abc123", null);
    // Restore direction: current "first\nnewer\nextra\n" → recorded
    // "first\nolder\n" adds one line and removes two: +1 -2
    expect(host.textContent).toContain("+1 -2");
  });

  it("compares against the open document's live contents, not a save", async () => {
    readHistory.mockResolvedValue([change()]);

    const host = await render({ currentContents: "first\nolder\nsame\n" });

    expect(readVersionDiff).toHaveBeenCalledWith("/notes", "Roadmap.md", "abc123", "first\nolder\nsame\n");
    // live "first\nolder\nsame\n" → recorded "first\nolder\n": restoring
    // removes the extra line: +0 -1
    expect(host.textContent).toContain("+0 -1");
  });

  it("says so plainly for a file that is not text", async () => {
    readHistory.mockResolvedValue([change()]);
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
    readHistory.mockResolvedValue([change()]);
    const host = await render({ onCompare, onRestore });
    return { host, onCompare };
  };

  it("opens the comparison through the shell", async () => {
    const { host, onCompare } = await renderForActions();

    await act(async () => button(host, "Compare Diff").click());

    expect(onCompare).toHaveBeenCalledWith("Roadmap.md", "abc123");
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
    let finishOtherRead: (changes: readonly RecordedChange[]) => void = () => undefined;
    const onRestore = vi.fn<() => Promise<void>>().mockReturnValue(
      new Promise((resolve) => {
        finishRestore = resolve;
      })
    );
    readHistory.mockImplementation(async (_rootPath, notePath) =>
      notePath === "Other.md"
        ? new Promise<readonly RecordedChange[]>((resolve) => {
            finishOtherRead = resolve;
          })
        : [change()]
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
    finishOtherRead([change({ id: "x1", message: "Other file's own record" })]);
    await act(async () => {
      await Promise.resolve();
    });

    expect(host.textContent).toContain("Other file's own record");
    expect(host.querySelector('[role="status"]')).toBeNull();
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

  it("says so plainly when the file has been saved once", async () => {
    const host = await render();

    expect(host.textContent).toContain("No earlier versions yet");
  });

  it("explains itself rather than showing an empty list when it cannot read", async () => {
    readHistory.mockRejectedValue(new Error("nope"));

    const host = await render();

    expect(host.querySelector('[role="alert"]')?.textContent).toBeTruthy();
  });
});
