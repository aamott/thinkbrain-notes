import { describe, expect, it } from "vitest";

import { createSettingsRegistry } from "../registry";
import { validateSettings } from "../validation";
import {
  DEFAULT_SETTLE_AUTOMATICALLY,
  syncModule,
  validateSyncDestination
} from "./sync";

describe("validateSyncDestination", () => {
  it("accepts the empty sentinel and ordinary remotes", () => {
    for (const value of [
      "",
      "https://example.test/notes.git",
      "https://token@example.test/notes.git",
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

  it("names a folder or an https git link, not a vague place", () => {
    const destination = syncModule.sections
      .flatMap((section) => section.settings ?? [])
      .find((setting) => setting.key === "destination");
    expect(destination?.label).toBe("Folder or git link");
    expect(destination?.description).toMatch(/folder/i);
    expect(destination?.description).toMatch(/https:\/\//i);
    expect(destination?.description).toMatch(/GitHub/i);
    expect(destination?.description).not.toMatch(/a place/i);
  });
});
