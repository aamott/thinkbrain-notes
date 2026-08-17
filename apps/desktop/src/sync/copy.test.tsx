// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ConflictComparison, ConflictSummary } from "./conflictTypes";

/**
 * Nothing in this feature may speak git to the user.
 *
 * The audit runs against what is actually rendered rather than against the
 * source, so `conflict.theirs.path` in code is fine and "theirs" on screen is
 * not — which is the distinction that matters and the one a grep cannot make.
 *
 * "Merge" and "merged" are deliberately absent from the list. The design this
 * screen was built from uses "save merged note", and merging two documents is
 * ordinary English — mail merge, merging lanes. It is the *nouns* of git that
 * mean nothing to someone who has never used it.
 */
const JARGON = [
  "commit",
  "HEAD",
  "repository",
  "repo",
  "git",
  "ours",
  "theirs",
  "diff",
  "hunk",
  "chunk",
  "branch",
  "checkout",
  "stash",
  "upstream",
  "rebase",
  "index",
  "blob",
  "checkpoint",
  "fingerprint"
];

const listConflicts = vi.fn<() => Promise<readonly ConflictSummary[]>>();
const readConflict = vi.fn<() => Promise<ConflictComparison>>();

vi.mock("./conflictService", () => ({
  listConflicts: () => listConflicts(),
  readConflict: () => readConflict(),
  resolveConflict: () => Promise.resolve({ note: "n", keptAs: null, checkpoint: "a" }),
  subscribeToConflictChanges: () => Promise.resolve(() => undefined)
}));

const { ConflictsPanel } = await import("./ConflictsPanel");
const { MergeTab } = await import("./MergeTab");

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const version = (path: string, label: string) => ({
  path,
  label,
  byteSize: 100,
  changedAt: null,
  fingerprint: "x"
});

const summary = (path: string, kind: "text" | "binary"): ConflictSummary => ({
  kind,
  ours: version(path, "This computer"),
  theirs: version(`${path}.copy`, "OneDrive")
});

const render = async (element: React.ReactElement): Promise<string> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(element));
  const text = container.textContent ?? "";
  await act(async () => root?.unmount());
  container.remove();
  root = null;
  container = null;
  return text;
};

/**
 * Whole words only. A note whose own text contains "yours" is the user's
 * writing, not our copy, and the substring "ours" inside it says nothing about
 * whether this screen speaks git.
 */
const audit = (what: string, text: string): void => {
  for (const word of JARGON) {
    expect(new RegExp(`\\b${word}\\b`, "i").test(text), `${what} says "${word}" to the user: ${text}`).toBe(false);
  }
};

describe("nothing in this feature speaks git to the user", () => {
  it("keeps the list plain, whatever kind of file is waiting", async () => {
    for (const [name, kind] of [
      ["Meeting Notes.md", "text"],
      ["diagram.png", "binary"],
      ["Roadmap.canvas", "text"]
    ] as const) {
      listConflicts.mockResolvedValue([summary(name, kind)]);
      audit(
        `the ${name} card`,
        await render(<ConflictsPanel rootPath="/notes" onReview={() => undefined} />)
      );
    }
  });

  it("keeps the empty list plain", async () => {
    listConflicts.mockResolvedValue([]);

    audit("the empty list", await render(<ConflictsPanel rootPath="/notes" onReview={() => undefined} />));
  });

  it("keeps the comparison plain", async () => {
    readConflict.mockResolvedValue({
      ...summary("Meeting Notes.md", "text"),
      chunks: [
        { kind: "common", text: "shared\n" },
        { kind: "choice", ours: "one line\n", theirs: "another line\n" }
      ]
    });

    audit(
      "the comparison",
      await render(<MergeTab rootPath="/notes" copyPath="Meeting Notes.md.copy" buffer={null} />)
    );
  });

  it("keeps a failure plain", async () => {
    readConflict.mockRejectedValue(new Error("boom"));

    audit(
      "the failure",
      await render(<MergeTab rootPath="/notes" copyPath="Meeting Notes.md.copy" buffer={null} />)
    );
  });
});
