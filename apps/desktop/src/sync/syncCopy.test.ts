import { describe, expect, it } from "vitest";

import {
  describeConflictRate,
  describeMoment,
  describePill,
  describeSync,
  describeWhatChanged,
  recoveryFor
} from "./syncCopy";
import { NOT_RECORDING, type SyncStatus } from "./historyTypes";

const AT = new Date("2026-08-17T09:31:00").getTime();
const NOW = new Date("2026-08-17T14:00:00");

const status = (over: Partial<SyncStatus>): SyncStatus => ({ ...NOT_RECORDING, state: "idle", ...over });

describe("when something happened", () => {
  it("says today by name, because that is how people remember today", () => {
    expect(describeMoment(AT, NOW)).toMatch(/^Today /);
  });

  it("says yesterday by name too", () => {
    const yesterday = new Date("2026-08-16T16:12:00").getTime();

    expect(describeMoment(yesterday, NOW)).toMatch(/^Yesterday /);
  });

  it("falls back to a date once a day name would stop helping", () => {
    const lastWeek = new Date("2026-08-09T16:12:00").getTime();

    const text = describeMoment(lastWeek, NOW);
    expect(text).not.toMatch(/Today|Yesterday/);
    expect(text).toContain("9");
  });

  it("does not invent a time it was not given", () => {
    expect(describeMoment(null, NOW)).toBe("Unknown");
  });
});

describe("what one recorded change touched", () => {
  it("counts the notes rather than listing them", () => {
    expect(
      describeWhatChanged([
        { path: "one.md", change: "updated" },
        { path: "two.md", change: "added" }
      ])
    ).toBe("2 notes changed");
  });

  it("keeps the singular singular", () => {
    expect(describeWhatChanged([{ path: "one.md", change: "updated" }])).toBe("1 note updated");
  });

  it("calls a removed note deleted", () => {
    expect(describeWhatChanged([{ path: "one.md", change: "removed" }])).toBe("1 note deleted");
  });
});

describe("the status footer", () => {
  it("says everything is saved, and when", () => {
    const pill = describePill(status({ lastRecordedAt: AT }), NOW);

    expect(pill.text).toContain("All saved");
    expect(pill.text).toContain("Today");
  });

  it("does not claim a time before anything has been saved", () => {
    const pill = describePill(status({ lastRecordedAt: null }), NOW);

    expect(pill.text).not.toMatch(/Today|Unknown/);
  });

  it("says it is bringing notes in step while a round trip is running", () => {
    const pill = describePill(status({ state: "syncing" }), NOW);

    expect(pill.text).toContain("in step");
    expect(pill.tone).toBe("busy");
  });

  it("names the live phase of a round trip without git plumbing", () => {
    expect(describePill(status({ state: "syncing", phase: "saving" }), NOW).text).toBe("Saving changes…");
    expect(describePill(status({ state: "syncing", phase: "saving" }), NOW).detail).toMatch(
      /recorded before checking the git link/
    );
    expect(describePill(status({ state: "syncing", phase: "checking" }), NOW).text).toBe(
      "Checking for updates…"
    );
    expect(describePill(status({ state: "syncing", phase: "combining" }), NOW).text).toBe(
      "Combining changes…"
    );
    expect(describePill(status({ state: "syncing", phase: "sending" }), NOW).text).toBe("Sending changes…");
  });

  it("says git sync is healthy after a successful check", () => {
    const pill = describePill(
      status({ state: "idle", health: "healthy", lastCheckedAt: AT, lastRecordedAt: AT }),
      NOW
    );

    expect(pill.text).toContain("Git sync healthy");
    expect(pill.text).toContain("Today");
    expect(pill.detail.toLowerCase()).toContain("check");
    expect(pill.detail.toLowerCase()).toContain("saved");
  });

  it("warns about a tidy failure without claiming saving has stopped", () => {
    const pill = describePill(
      status({
        state: "idle",
        maintenanceProblem: {
          code: "sync.history_cleanup_failed",
          message: "Could not tidy the saved undo history on this computer."
        }
      }),
      NOW
    );

    expect(pill.text).toBe("Could not free space");
    expect(pill.tone).toBe("warn");
    expect(pill.detail).toContain("Free space now");
    expect(pill.detail).not.toMatch(/not saving/i);
  });

  it("counts notes that need a decision", () => {
    expect(describePill(status({ state: "attention", attention: 2 }), NOW).text).toBe(
      "2 notes need a decision"
    );
    expect(describePill(status({ state: "attention", attention: 1 }), NOW).text).toBe(
      "1 note needs a decision"
    );
    expect(describePill(status({ state: "attention", attention: 1 }), NOW).detail).toBe(
      "1 note needs a decision. Open Decisions needed to choose what to keep."
    );
  });

  it("says out loud when this folder is not being recorded at all", () => {
    expect(describePill(NOT_RECORDING, NOW).text).toBeTruthy();
    expect(describePill(NOT_RECORDING, NOW).tone).toBe("quiet");
    expect(describePill(NOT_RECORDING, NOW).detail).toBe("Versions of your notes are not being saved here.");
  });

  it("explains when its own history is why recording is off", () => {
    const pill = describePill(status({ state: "off", alongsideOwnGit: true }), NOW);

    expect(pill.detail).toContain("keeps its own version history");
    // The alongside-git sentence is owned by `describePill`; the "off" branch
    // must not also say it, or the user sees it twice.
    expect(pill.detail).not.toMatch(/keeps its own version history.*keeps its own version history/);
  });

  // A failure nobody can act on is a failure nobody will act on.
  it("always names something to do about a failure", () => {
    for (const code of [
      "sync.note_read_failed",
      "sync.note_write_failed",
      "sync.note_store_failed",
      "sync.commit_failed",
      "sync.auth_required",
      "sync.credentials_invalid",
      "sync.credentials_forbidden",
      "sync.credentials_unavailable",
      "sync.remote_not_found",
      "something.nobody.planned.for"
    ]) {
      const pill = describePill(
        status({ state: "problem", problem: { code, message: "Could not record this change." } }),
        NOW
      );

      expect(pill.tone).toBe("warn");
      expect(pill.detail).toContain("Could not record this change.");
      expect(pill.detail.length).toBeGreaterThan("Could not record this change.".length);
      expect(recoveryFor(code)).toMatch(/[a-z]/);
    }
  });

  it("points a problem at the recovery that suits it", () => {
    expect(recoveryFor("sync.note_store_failed")).not.toBe(recoveryFor("sync.note_read_failed"));
    expect(recoveryFor("sync.note_write_failed")).not.toBe(recoveryFor("sync.note_read_failed"));
  });

  // The sentences themselves, not just that they differ. A recovery that
  // drifts from what the design wrote is a regression even if it is still
  // unique, so each branch is pinned to its exact wording.
  it("says the exact sentence each branch was written to say", () => {
    expect(recoveryFor("sync.auth_required")).toBe(
      "Open Settings and save the correct username and access token for this git link."
    );
    expect(recoveryFor("sync.credentials_forbidden")).toBe(
      "Give this token access to the repository, then save the sign-in again."
    );
    expect(recoveryFor("sync.credentials_unavailable")).toBe(
      "Your saved sign-ins are locked. Unlock them, then save the sign-in again."
    );
    expect(recoveryFor("sync.sign_in_missing")).toBe(
      "Choose another saved sign-in, or add a username and access token."
    );
    expect(recoveryFor("sync.sign_in_needed")).toBe(
      "Choose a saved sign-in, or add a username and access token."
    );
    expect(recoveryFor("sync.remote_not_found")).toBe(
      "Check the git link. If this is a private repository, make sure the token can access it."
    );
    expect(recoveryFor("sync.note_read_failed")).toBe(
      "Check the notes folder is still connected, then edit any note to try again."
    );
    expect(recoveryFor("sync.note_write_failed")).toBe(
      "Check this note can be saved on this computer — a name Windows refuses, or a folder sitting where the note belongs — then bring these notes in step again."
    );
    expect(recoveryFor("sync.vault_too_deep")).toBe(
      "Some folders here are nested too deeply to keep track of. Move them nearer the top of the folder and open it again."
    );
    // The default branch: a code nobody planned for still has to name a move.
    expect(recoveryFor("something.nobody.planned.for")).toBe(
      "Close this folder and open it again to start saving versions."
    );
    expect(recoveryFor("sync.remote_unreachable")).toBe(
      "Check the git link and your connection, then bring these notes in step again."
    );
    expect(recoveryFor("sync.symlink_skipped")).toBe(
      "Replace or remove this item on the device that sent it, then bring these notes in step again."
    );
    expect(recoveryFor("sync.submodule_skipped")).toBe(recoveryFor("sync.symlink_skipped"));
    expect(recoveryFor("sync.history_cleanup_failed")).toBe(
      "Check this computer has space left, then try Free space now in Settings."
    );
  });
});

describe("how often this folder has needed something of you", () => {
  it("says plainly when it never has", () => {
    const text = describeConflictRate({ decisions: 0, settled: 0, recorded: 340 });

    expect(text).toContain("340 saved versions");
    expect(text).toContain("never");
  });

  // The number that makes the feature visible: someone should be able to see
  // that the noise is being absorbed rather than simply not happening.
  it("reports what was tidied away separately from what was asked", () => {
    const text = describeConflictRate({ decisions: 2, settled: 47, recorded: 340 });

    expect(text).toContain("2 of them needed you");
    expect(text).toContain("47 duplicate copies were tidied away");
  });

  it("says nothing needed you even when copies were tidied", () => {
    const text = describeConflictRate({ decisions: 0, settled: 5, recorded: 340 });

    expect(text).toContain("never");
    expect(text).toContain("5 duplicate copies");
  });

  it("keeps the singulars singular", () => {
    const text = describeConflictRate({ decisions: 1, settled: 1, recorded: 1 });

    expect(text).toContain("1 saved version.");
    expect(text).toContain("1 duplicate copy was");
  });
});

describe("describeSync", () => {
  const moved = { state: "moved" } as const;

  it("says so when there was nothing to bring down", () => {
    const text = describeSync({ broughtDown: 0, askedAbout: 0, sent: 0, landed: moved });

    expect(text).toContain("already in step");
  });

  it("counts what arrived", () => {
    const text = describeSync({ broughtDown: 3, askedAbout: 0, sent: 4, landed: moved });

    expect(text).toContain("3 notes arrived");
    expect(text).not.toContain("choose");
  });

  it("keeps the singulars singular", () => {
    const text = describeSync({ broughtDown: 1, askedAbout: 1, sent: 2, landed: moved });

    expect(text).toContain("1 note arrived");
    expect(text).toContain("1 note needs you to decide");
  });

  // A refusal is someone else's timing, not this person's problem, and the
  // only useful instruction is to wait.
  it("turns a refusal into something to do rather than a fault", () => {
    const text = describeSync({
      broughtDown: 0,
      askedAbout: 0,
      sent: 0,
      landed: { state: "refused", reason: "the other end holds changes this device has not seen" }
    });

    expect(text).toContain("Try again in a moment");
    expect(text.toLowerCase()).not.toContain("refus");
    expect(text.toLowerCase()).not.toContain("reject");
  });
});
