// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ConflictComparison, ConflictSummary } from "./conflictTypes";
import { NOT_RECORDING, type RecordedChange, type SyncState, type SyncStatus } from "./historyTypes";
import { cleanup, render } from "./syncTestHarness";

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
 *
 * "git" is allowed in Decisions needed and in settings — the link field is a git
 * link, and a card should say when a copy came from git rather than a cloud app.
 */
const JARGON = [
  "commit",
  "HEAD",
  "repository",
  "repo",
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

const readHistory = vi.fn<() => Promise<readonly RecordedChange[]>>();

vi.mock("./syncService", () => ({
  // `alongsideOwnGit` on, so the sentence a folder under its own version
  // control gets is audited like everything else.
  readSyncStatus: () =>
    Promise.resolve({ ...NOT_RECORDING, state: "idle", alongsideOwnGit: true }),
  readHistory: () => readHistory(),
  readConflictRate: () => Promise.resolve({ decisions: 2, settled: 47, recorded: 340 }),
  restoreVersion: () => Promise.resolve(),
  subscribeToSyncStatus: () => Promise.resolve(() => undefined),
  readHistoryUsage: () => Promise.resolve({ bytes: 2048 }),
  freeSyncSpace: () => Promise.resolve({ bytesBefore: 2048, bytesAfter: 2048, reclaimed: 0 }),
  clearUndoHistory: () => Promise.resolve({ bytesBefore: 2048, bytesAfter: 1024, reclaimed: 1024 })
}));

const { ConflictsPanel } = await import("./ConflictsPanel");
const { MergeTab } = await import("./MergeTab");
const { HistoryPanel } = await import("./HistoryPanel");
const { SyncPill } = await import("./SyncPill");
const { describeSync } = await import("./syncCopy");
const { HistoryPolicyControl } = await import("../settings/controls/HistoryPolicyControl");

afterEach(async () => {
  await cleanup();
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

const renderText = async (element: React.ReactElement): Promise<string> => {
  const { host, unmount } = await render(element);
  const text = host.textContent ?? "";
  await unmount();
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
        await renderText(<ConflictsPanel rootPath="/notes" onReview={() => undefined} />)
      );
    }

    listConflicts.mockResolvedValue([{ ...summary("Meeting Notes.md", "text"), decision: "keepOrDelete" }]);
    audit(
      "the keep-or-delete card",
      await renderText(<ConflictsPanel rootPath="/notes" onReview={() => undefined} />)
    );
  });

  it("keeps the empty list plain", async () => {
    listConflicts.mockResolvedValue([]);

    audit("the empty list", await renderText(<ConflictsPanel rootPath="/notes" onReview={() => undefined} />));
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
      await renderText(<MergeTab rootPath="/notes" copyPath="Meeting Notes.md.copy" buffer={null} />)
    );
  });

  it("keeps a failure plain", async () => {
    readConflict.mockRejectedValue(new Error("boom"));

    audit(
      "the failure",
      await renderText(<MergeTab rootPath="/notes" copyPath="Meeting Notes.md.copy" buffer={null} />)
    );
  });

  it("keeps the history plain, opened and closed", async () => {
    readHistory.mockResolvedValue([
      {
        id: "abc123",
        at: Date.now(),
        message: "Sync 2026-08-17 09:31 — 2 notes changed",
        notes: [
          { path: "Meeting Notes.md", change: "updated" },
          { path: "Gone.md", change: "removed" }
        ]
      }
    ]);

    for (const note of [null, "Meeting Notes.md"]) {
      audit(
        `the history for ${note ?? "everything"}`,
        await renderText(
          <HistoryPanel rootPath="/notes" note={note} onShowEverything={() => undefined} />
        )
      );
    }
  });

  it("keeps the empty history plain", async () => {
    readHistory.mockResolvedValue([]);

    audit(
      "the empty history",
      await renderText(<HistoryPanel rootPath="/notes" note={null} onShowEverything={() => undefined} />)
    );
  });

  // Every state of the footer, including the ones that only appear when
  // something has gone wrong — which is exactly when jargon would land worst.
  // The `alongsideOwnGit` variant runs the "this folder also keeps its own
  // version history" sentence through the same audit, in every state —
  // including `problem`, where the appended sentence sits next to a failure.
  it("keeps the footer plain in every state it has", async () => {
    const extras: readonly { label: string; status: SyncStatus }[] = [
      {
        label: "idle healthy",
        status: {
          ...NOT_RECORDING,
          state: "idle",
          health: "healthy",
          lastCheckedAt: Date.now(),
          lastRecordedAt: Date.now()
        }
      },
      { label: "syncing saving", status: { ...NOT_RECORDING, state: "syncing", phase: "saving" } },
      { label: "syncing checking", status: { ...NOT_RECORDING, state: "syncing", phase: "checking" } },
      { label: "syncing combining", status: { ...NOT_RECORDING, state: "syncing", phase: "combining" } },
      { label: "syncing sending", status: { ...NOT_RECORDING, state: "syncing", phase: "sending" } },
      {
        label: "idle maintenance",
        status: {
          ...NOT_RECORDING,
          state: "idle",
          maintenanceProblem: {
            code: "sync.history_cleanup_failed",
            message: "Could not tidy the saved undo history on this computer."
          }
        }
      }
    ];

    for (const state of ["off", "idle", "saving", "syncing", "attention", "problem"] as const) {
      for (const alongsideOwnGit of [false, true] as const) {
        const status = {
          ...NOT_RECORDING,
          state: state as SyncState,
          lastRecordedAt: Date.now(),
          waiting: 1,
          attention: 2,
          stuck: [],
          alongsideOwnGit,
          problem:
            state === "problem"
              ? { code: "sync.note_read_failed", message: "A note could not be read." }
              : null
        };
        const { host, unmount } = await render(<SyncPill status={status} onOpen={() => undefined} />);
        const spoken = host.querySelector("button")?.getAttribute("aria-label") ?? "";
        audit(
          `the footer while ${state}${alongsideOwnGit ? " alongside own git" : ""}`,
          `${host.textContent ?? ""} ${spoken}`
        );
        await unmount();
      }
    }

    for (const extra of extras) {
      const { host, unmount } = await render(<SyncPill status={extra.status} onOpen={() => undefined} />);
      const spoken = host.querySelector("button")?.getAttribute("aria-label") ?? "";
      audit(`the footer while ${extra.label}`, `${host.textContent ?? ""} ${spoken}`);
      await unmount();
    }
  });

  it("keeps the undo-history settings control plain", async () => {
    const definition = {
      key: "sync.historyPolicy",
      label: "Saved undo history",
      description:
        "Undo copies from resolving two versions or putting an earlier version back are kept for 90 days on this computer.",
      type: "string" as const,
      default: "",
      scope: "app" as const,
      section: "sync.history"
    };
    audit(
      "the undo history settings",
      await renderText(
        <HistoryPolicyControl definition={definition} value="" onChange={() => undefined} />
      )
    );
  });

  // `describeSync` is not rendered by any panel above, so its sentences are
  // audited directly — both the refusal path and the ordinary "moved" path,
  // since each says something different.
  it("keeps describeSync plain for a refusal and a moved landing", () => {
    audit(
      "describeSync on refusal",
      describeSync({
        broughtDown: 0,
        askedAbout: 0,
        sent: 0,
        landed: { state: "refused", reason: "the other end holds changes this device has not seen" }
      })
    );
    audit(
      "describeSync on moved",
      describeSync({ broughtDown: 2, askedAbout: 1, sent: 3, landed: { state: "moved" } })
    );
  });
});
