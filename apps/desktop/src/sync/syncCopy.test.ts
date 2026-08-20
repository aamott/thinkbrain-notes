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

  it("counts what is waiting on the user", () => {
    expect(describePill(status({ state: "attention", attention: 2 }), NOW).text).toContain(
      "2 items need"
    );
    expect(describePill(status({ state: "attention", attention: 1 }), NOW).text).toContain(
      "1 item needs"
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
  });

  /// A failure nobody can act on is a failure nobody will act on.
  it("always names something to do about a failure", () => {
    for (const code of [
      "sync.note_read_failed",
      "sync.note_write_failed",
      "sync.note_store_failed",
      "sync.commit_failed",
      "sync.auth_required",
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
});

describe("how often this folder has needed something of you", () => {
  it("says plainly when it never has", () => {
    const text = describeConflictRate({ decisions: 0, settled: 0, recorded: 340 });

    expect(text).toContain("340 saved versions");
    expect(text).toContain("never");
  });

  /// The number that makes the feature visible: someone should be able to see
  /// that the noise is being absorbed rather than simply not happening.
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
    expect(text).toContain("1 note needs you to choose");
  });

  /// A refusal is someone else's timing, not this person's problem, and the
  /// only useful instruction is to wait.
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
