// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ConflictComparison } from "./conflictTypes";

const readConflict = vi.fn<() => Promise<ConflictComparison>>();
const resolveConflict = vi.fn<() => Promise<unknown>>();

vi.mock("./conflictService", () => ({
  readConflict: () => readConflict(),
  resolveConflict: (...args: unknown[]) => resolveConflict(...(args as []))
}));

const { MergeTab } = await import("./MergeTab");

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const COMPARISON: ConflictComparison = {
  kind: "text",
  ours: {
    path: "Meeting Notes.md",
    label: "This computer",
    byteSize: 40,
    changedAt: null,
    fingerprint: "ours"
  },
  theirs: {
    path: "Meeting Notes.sync-conflict-20260816-093100-K3SDFHG.md",
    label: "OneDrive",
    byteSize: 44,
    changedAt: null,
    fingerprint: "theirs"
  },
  chunks: [
    { kind: "common", text: "# Q3 sync\nattendees\n" },
    { kind: "choice", ours: "follow up with design\n", theirs: "sync directly with design\n" },
    { kind: "common", text: "next check-in Aug 18\n" }
  ]
};

beforeEach(() => {
  readConflict.mockReset().mockResolvedValue(COMPARISON);
  resolveConflict.mockReset().mockResolvedValue({ note: "Meeting Notes.md", keptAs: null, checkpoint: "a" });
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const render = async (): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(<MergeTab rootPath="/notes" copyPath={COMPARISON.theirs.path} buffer={null} />)
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

const result = (host: HTMLElement): string =>
  host.querySelector('[aria-label="Result"] pre')?.textContent ?? "";

describe("comparing two versions", () => {
  it("opens with both sides named the way the user knows them", async () => {
    const host = await render();

    expect(host.textContent).toContain("Two versions of this note exist");
    expect(host.textContent).toContain("This computer");
    expect(host.textContent).toContain("OneDrive");
  });

  // The whole reason the screen is bearable: the parts nobody has to think
  // about are one quiet line, not a wall of text to scroll past.
  it("collapses the stretches both versions agree on", async () => {
    const host = await render();

    expect(host.textContent).toContain("2 identical lines");
    expect(host.textContent).toContain("1 identical line");
  });

  it("names each choice after where the version came from", async () => {
    const host = await render();

    expect(() => button(host, "Keep this computer's")).not.toThrow();
    expect(() => button(host, "Keep OneDrive's")).not.toThrow();
    expect(() => button(host, "Keep both")).not.toThrow();
  });
});

describe("the result pane", () => {
  it("starts as a real document rather than a form with holes", async () => {
    const host = await render();

    expect(result(host)).toBe("# Q3 sync\nattendees\nfollow up with design\nnext check-in Aug 18\n");
  });

  it("follows each choice as it is made", async () => {
    const host = await render();

    await act(async () => button(host, "Keep OneDrive's").click());

    expect(result(host)).toBe(
      "# Q3 sync\nattendees\nsync directly with design\nnext check-in Aug 18\n"
    );
  });

  /// The promise the screen is built on: what is previewed is what is written.
  it("is exactly what gets saved", async () => {
    const host = await render();
    await act(async () => button(host, "Keep both").click());
    const previewed = result(host);

    await act(async () => button(host, "Done").click());

    expect(resolveConflict).toHaveBeenCalledWith("/notes", COMPARISON, {
      kind: "merged",
      contents: previewed
    });
  });
});

describe("saving", () => {
  // Saving with a section undecided would accept a side the user never looked
  // at, which in this screen means throwing away somebody's writing.
  it("waits until every section has been decided", async () => {
    const host = await render();

    expect(button(host, "still to choose").disabled).toBe(true);

    await act(async () => button(host, "Keep this computer's").click());

    expect(button(host, "Done").disabled).toBe(false);
  });

  it("says what happened, and that it can be undone", async () => {
    const host = await render();
    await act(async () => button(host, "Keep this computer's").click());

    await act(async () => button(host, "Done").click());

    expect(host.textContent).toContain("Saved");
    expect(host.textContent).toContain("History");
  });

  /// The native side refuses a write whose versions have moved. That refusal is
  /// the user's cue that someone else got there first, so it has to be visible.
  it("shows a refusal rather than pretending the note was saved", async () => {
    resolveConflict.mockRejectedValue(new Error("One of these versions changed."));
    const host = await render();
    await act(async () => button(host, "Keep this computer's").click());

    await act(async () => button(host, "Done").click());

    expect(host.textContent).toContain("Could not compare these versions");
    expect(host.textContent).not.toContain("Saved");
  });
});

describe("a file that cannot be compared piece by piece", () => {
  it("says so instead of showing an empty comparison", async () => {
    readConflict.mockResolvedValue({ ...COMPARISON, kind: "binary", chunks: [] });

    const host = await render();

    expect(host.textContent).toContain("can't be compared piece by piece");
  });
});
