// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ConflictKind, ConflictSummary } from "./conflictTypes";

const listConflicts = vi.fn<() => Promise<readonly ConflictSummary[]>>();
const resolveConflict = vi.fn<() => Promise<unknown>>();

vi.mock("./conflictService", () => ({
  listConflicts: () => listConflicts(),
  resolveConflict: (...args: unknown[]) => resolveConflict(...(args as [])),
  subscribeToConflictChanges: () => Promise.resolve(() => undefined)
}));

vi.mock("./useSyncStatus", () => ({
  useSyncStatus: () => ({
    state: "off",
    lastRecordedAt: null,
    waiting: 0,
    attention: 0,
    stuck: [],
    problem: null,
    alongsideOwnGit: false
  })
}));

const { ConflictsPanel } = await import("./ConflictsPanel");

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  listConflicts.mockReset().mockResolvedValue([]);
  resolveConflict.mockReset().mockResolvedValue({ note: "note.md", keptAs: null, checkpoint: "a" });
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const conflict = (path: string, kind: ConflictKind): ConflictSummary => ({
  kind,
  ours: {
    path,
    label: "This computer",
    byteSize: 219_136,
    changedAt: null,
    fingerprint: "ours"
  },
  theirs: {
    path: `${path}.sync-conflict-20260816-093100-K3SDFHG.md`,
    label: "Syncthing",
    byteSize: 243_712,
    changedAt: null,
    fingerprint: "theirs"
  }
});

const render = async (onReview = vi.fn()): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<ConflictsPanel rootPath="/notes" onReview={onReview} />));
  return container;
};

const button = (host: HTMLElement, text: string): HTMLButtonElement => {
  const found = [...host.querySelectorAll("button")].find((candidate) =>
    candidate.textContent?.includes(text)
  );
  if (!found) throw new Error(`No button reading "${text}" among: ${host.textContent}`);
  return found;
};

describe("the list of things waiting on you", () => {
  it("says so plainly when there is nothing", async () => {
    const host = await render();

    expect(host.textContent).toContain("Nothing needs your attention");
  });

  it("names each note and who else has a version of it", async () => {
    listConflicts.mockResolvedValue([conflict("journal/Meeting Notes.md", "text")]);

    const host = await render();

    expect(host.textContent).toContain("Meeting Notes.md");
    expect(host.textContent).toContain("Syncthing");
  });

  it("keeps reading the rest of the list when one card cannot be built", async () => {
    listConflicts.mockRejectedValue(new Error("nope"));

    const host = await render();

    expect(host.querySelector('[role="alert"]')?.textContent).toBeTruthy();
  });
});

describe("what each card offers", () => {
  it("offers a review for a note that can be compared", async () => {
    listConflicts.mockResolvedValue([conflict("Meeting Notes.md", "text")]);
    const onReview = vi.fn();

    const host = await render(onReview);
    await act(async () => button(host, "Review").click());

    expect(onReview).toHaveBeenCalledWith(
      "Meeting Notes.md.sync-conflict-20260816-093100-K3SDFHG.md",
      "Meeting Notes.md"
    );
  });

  // An image has nothing to review; the card is the whole interaction, and it
  // shows the two sizes so the user has something to choose between.
  it("offers a whole-version choice for a picture, with both sizes", async () => {
    listConflicts.mockResolvedValue([conflict("diagram.png", "binary")]);

    const host = await render();

    expect(host.textContent).toContain("214 KB");
    expect(host.textContent).toContain("238 KB");
    expect(() => button(host, "Review")).toThrow();
  });

  it("explains itself instead of comparing a whiteboard", async () => {
    listConflicts.mockResolvedValue([conflict("Roadmap.canvas", "text")]);

    const host = await render();

    expect(host.textContent).toContain("Visual compare isn't available yet for whiteboards");
  });

  it("carries a decision made from the card straight through", async () => {
    listConflicts.mockResolvedValue([conflict("diagram.png", "binary")]);

    const host = await render();
    await act(async () => button(host, "Keep both").click());

    expect(resolveConflict).toHaveBeenCalledWith("/notes", expect.anything(), { kind: "keepBoth" });
  });

  /// A failed decision has to say so and leave the list alone — the native side
  /// wrote nothing, and a card that quietly vanished would say otherwise.
  it("reports a refused decision without dropping the card", async () => {
    listConflicts.mockResolvedValue([conflict("diagram.png", "binary")]);
    resolveConflict.mockRejectedValue(new Error("refused"));

    const host = await render();
    await act(async () => button(host, "Keep both").click());

    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Nothing was changed");
    expect(host.textContent).toContain("diagram.png");
  });
});
