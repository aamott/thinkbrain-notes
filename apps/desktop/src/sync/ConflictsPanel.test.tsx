// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ConflictKind, ConflictResolution, ConflictSummary } from "./conflictTypes";
import { NOT_RECORDING, type SyncStatus } from "./historyTypes";
import { button, cleanup, render } from "./syncTestHarness";

const listConflicts = vi.fn<(rootPath: string) => Promise<readonly ConflictSummary[]>>();
const resolveConflict = vi.fn<
  (rootPath: string, summary: ConflictSummary, resolution: ConflictResolution) => Promise<unknown>
>();

vi.mock("./conflictService", () => ({
  listConflicts: (rootPath: string) => listConflicts(rootPath),
  resolveConflict: (rootPath: string, summary: ConflictSummary, resolution: ConflictResolution) =>
    resolveConflict(rootPath, summary, resolution)
}));

// The panel reads `stuck` from this hook. A module-level variable backs the
// mock so a test can swap in a non-empty list without re-registering the mock.
let syncStatus: SyncStatus = { ...NOT_RECORDING };

vi.mock("./useSyncStatus", () => ({
  useSyncStatus: () => syncStatus
}));

const { ConflictsPanel } = await import("./ConflictsPanel");

beforeEach(() => {
  listConflicts.mockReset().mockResolvedValue([]);
  resolveConflict.mockReset().mockResolvedValue({ note: "note.md", keptAs: null, checkpoint: "a" });
  syncStatus = { ...NOT_RECORDING };
});

afterEach(async () => {
  await cleanup();
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

describe("the list of things waiting on you", () => {
  it("says so plainly when there is nothing", async () => {
    const { host } = await render(<ConflictsPanel rootPath="/notes" onReview={() => undefined} />);

    expect(host.textContent).toContain("No notes with two versions");
  });

  it("names each note and who else has a version of it", async () => {
    listConflicts.mockResolvedValue([conflict("journal/Meeting Notes.md", "text")]);

    const { host } = await render(<ConflictsPanel rootPath="/notes" onReview={() => undefined} />);

    expect(host.textContent).toContain("Meeting Notes.md");
    expect(host.textContent).toContain("Syncthing");
  });

  it("keeps reading the rest of the list when one card cannot be built", async () => {
    listConflicts.mockRejectedValue(new Error("nope"));

    const { host } = await render(<ConflictsPanel rootPath="/notes" onReview={() => undefined} />);

    expect(host.querySelector('[role="alert"]')?.textContent).toBeTruthy();
  });
});

describe("what each card offers", () => {
  it("offers a review for a note that can be compared", async () => {
    listConflicts.mockResolvedValue([conflict("Meeting Notes.md", "text")]);
    const onReview = vi.fn();

    const { host } = await render(<ConflictsPanel rootPath="/notes" onReview={onReview} />);
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

    const { host } = await render(<ConflictsPanel rootPath="/notes" onReview={() => undefined} />);

    expect(host.textContent).toContain("214 KB");
    expect(host.textContent).toContain("238 KB");
    expect(() => button(host, "Review")).toThrow();
  });

  it("explains itself instead of comparing a whiteboard", async () => {
    listConflicts.mockResolvedValue([conflict("Roadmap.canvas", "text")]);

    const { host } = await render(<ConflictsPanel rootPath="/notes" onReview={() => undefined} />);

    expect(host.textContent).toContain("Visual compare isn't available yet for whiteboards");
  });

  it("carries a decision made from the card straight through", async () => {
    listConflicts.mockResolvedValue([conflict("diagram.png", "binary")]);

    const { host } = await render(<ConflictsPanel rootPath="/notes" onReview={() => undefined} />);
    await act(async () => button(host, "Keep both").click());

    expect(resolveConflict).toHaveBeenCalledWith("/notes", expect.anything(), { kind: "keepBoth" });
  });

  // A failed decision has to say so and leave the list alone — the native side
  // wrote nothing, and a card that quietly vanished would say otherwise.
  it("reports a refused decision without dropping the card", async () => {
    listConflicts.mockResolvedValue([conflict("diagram.png", "binary")]);
    resolveConflict.mockRejectedValue(new Error("refused"));

    const { host } = await render(<ConflictsPanel rootPath="/notes" onReview={() => undefined} />);
    await act(async () => button(host, "Keep both").click());

    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Nothing was changed");
    expect(host.textContent).toContain("diagram.png");
  });
});

describe("notes that could not be kept in step", () => {
  // The stuck list is separate from the conflicts list: a note that the
  // recorder could not write still needs a card, and the card still needs the
  // sentence that says what to do about it.
  it("names the note and the recovery that suits its failure", async () => {
    syncStatus = {
      ...syncStatus,
      stuck: [
        {
          path: "journal/Stuck Note.md",
          code: "sync.note_read_failed",
          message: "A note could not be read."
        }
      ]
    };

    const { host } = await render(<ConflictsPanel rootPath="/notes" onReview={() => undefined} />);

    expect(host.textContent).toContain("Stuck Note.md");
    expect(host.textContent).toContain("Could not be kept in step");
    // The recovery sentence for a read failure, exactly as `recoveryFor` gives it.
    expect(host.textContent).toContain(
      "Check the notes folder is still connected, then edit any note to try again."
    );
  });
});

describe("a decision in flight", () => {
  // While the native side is writing, the same buttons must not be clickable a
  // second time — a double decision would race two writes against one note.
  // Once it lands they come back, so a follow-up (or undoing the choice) is
  // still possible.
  it("disables the card's buttons mid-flight and re-enables them after", async () => {
    listConflicts.mockResolvedValue([conflict("diagram.png", "binary")]);
    let resolveDecision: ((value: unknown) => void) | null = null;
    resolveConflict.mockImplementation(
      () => new Promise<unknown>((resolve) => { resolveDecision = resolve; })
    );

    const { host } = await render(<ConflictsPanel rootPath="/notes" onReview={() => undefined} />);
    const keepBoth = () => button(host, "Keep both");
    const keepOurs = () => button(host, "Keep this computer's");

    // Both buttons are present and enabled before anything is clicked.
    expect(keepBoth().disabled).toBe(false);
    expect(keepOurs().disabled).toBe(false);

    await act(async () => { keepBoth().click(); });

    // Mid-flight: every decision button on the card is disabled.
    expect(keepBoth().disabled).toBe(true);
    expect(keepOurs().disabled).toBe(true);

    // After the native side answers, the buttons come back.
    await act(async () => { resolveDecision?.(undefined); });
    expect(keepBoth().disabled).toBe(false);
    expect(keepOurs().disabled).toBe(false);
  });
});
