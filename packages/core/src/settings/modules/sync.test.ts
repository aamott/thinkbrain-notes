import { describe, expect, it } from "vitest";

import { createSettingsRegistry } from "../registry";
import { validateSettings } from "../validation";
import {
  DEFAULT_CHECKPOINT_RETENTION_DAYS,
  DEFAULT_HISTORICAL_FILE_LIMIT_MB,
  DEFAULT_SETTLE_AUTOMATICALLY,
  syncModule,
  validateSyncDestination
} from "./sync";

describe("validateSyncDestination", () => {
  it("accepts the empty sentinel and ordinary remotes", () => {
    for (const value of [
      "",
      "https://example.test/notes.git",
      "ssh://git@example.test/notes.git",
      "file:///tmp/notes.git",
      "git@example.test:notes.git",
      "/tmp/notes.git",
      "./notes.git"
    ]) {
      expect(validateSyncDestination(value)).toBeNull();
    }
  });

  it("rejects whitespace-only strings and non-URI leftovers", () => {
    expect(validateSyncDestination("   ")).not.toBeNull();
    expect(validateSyncDestination("git@host")).not.toBeNull();
    expect(validateSyncDestination("not a remote")).not.toBeNull();
  });

  it("keeps credentials out of the link field", () => {
    expect(validateSyncDestination("https://token@example.test/notes.git")).toMatch(/sign-in fields/i);
    expect(validateSyncDestination("https://me:token@example.test/notes.git")).toMatch(/sign-in fields/i);
  });
});

describe("sync module", () => {
  it("keeps the settle default named so the native copy is searchable", () => {
    expect(DEFAULT_SETTLE_AUTOMATICALLY).toBe(true);
    expect(syncModule.sections[0]?.settings?.[0]?.default).toBe(
      DEFAULT_SETTLE_AUTOMATICALLY
    );
  });

  it("validates destination through the registry hook", () => {
    const registry = createSettingsRegistry();
    registry.register(syncModule);

    expect(validateSettings(registry, { "sync.destination": "" })).toEqual([]);
    expect(
      validateSettings(registry, { "sync.destination": "git@host" })
    ).toMatchObject([{ code: "settings.validation.failed" }]);
  });

  it("names a git link, not a vague place", () => {
    const destination = syncModule.sections
      .flatMap((section) => section.settings ?? [])
      .find((setting) => setting.key === "destination");
    expect(destination?.label).toBe("Git link");
    expect(destination?.description).toMatch(/https:\/\//i);
    expect(destination?.description).toMatch(/GitHub/i);
    expect(destination?.description).not.toMatch(/a place/i);
    expect(destination?.control).toBe("sync-git-link");
  });

  it("keeps the selected sign-in id as a hidden workspace setting", () => {
    const profile = syncModule.sections
      .flatMap((section) => section.settings ?? [])
      .find((setting) => setting.key === "signInProfile");
    expect(profile?.scope).toBe("workspace");
    expect(profile?.portable).toBe(false);
    expect(profile?.default).toBe("");
  });

  it("explains cloud copies separately from git", () => {
    const cloud = syncModule.sections.find((section) => section.id === "sync.conflicts");
    const git = syncModule.sections.find((section) => section.id === "sync.destination");
    expect(cloud?.label).toBe("Cloud copies");
    expect(git?.label).toBe("Git link");
    expect(cloud?.settings?.[0]?.description).toMatch(/Decisions needed/i);
    expect(cloud?.settings?.[0]?.description).toMatch(/OneDrive/i);
  });

  it("documents app-wide undo retention without promising a size cap", () => {
    expect(DEFAULT_CHECKPOINT_RETENTION_DAYS).toBe(90);
    expect(DEFAULT_HISTORICAL_FILE_LIMIT_MB).toBe(25);
    const history = syncModule.sections.find((section) => section.id === "sync.history");
    expect(history?.label).toBe("Saved undo history");
    expect(history?.settings?.[0]?.control).toBe("sync-history-policy");
    expect(history?.settings?.[0]?.portable).toBe(false);
    expect(history?.settings?.[0]?.description).toMatch(
      new RegExp(`${DEFAULT_CHECKPOINT_RETENTION_DAYS} days`)
    );
    expect(history?.settings?.[0]?.description).toMatch(
      new RegExp(`${DEFAULT_HISTORICAL_FILE_LIMIT_MB} MB`)
    );
    expect(history?.settings?.[0]?.description).toMatch(/retention threshold/);
    expect(history?.settings?.[0]?.description).not.toMatch(/size cap/i);
    expect(history?.settings?.[0]?.description).not.toMatch(/\bcheckpoint\b/i);
  });

  it("offers a sync trigger policy that defaults to auto", () => {
    const registry = createSettingsRegistry();
    registry.register(syncModule);
    const definition = registry.getDefinition("sync.trigger");

    expect(definition?.default).toBe("auto");
    expect(validateSettings(registry, { "sync.trigger": "manual" })).toEqual([]);
    expect(validateSettings(registry, { "sync.trigger": "whenever" })).not.toEqual([]);
  });
});
