import { describe, expect, it } from "vitest";

import { parseExtensionManifest } from "./manifest";

const VALID = {
  id: "note-stats",
  name: "Note Stats",
  version: "1.0.0",
  apiVersion: "^1.0.0",
  engines: { platform: ["desktop", "mobile"] },
  activationEvents: ["onCommand:show", "onView:stats"],
  capabilities: [],
  contributes: {
    commands: [{ id: "show", title: "Show note stats" }],
    panels: [{ id: "stats", label: "Note Stats", icon: "∑", side: "right" }]
  }
};

describe("parseExtensionManifest", () => {
  it("accepts a complete manifest", () => {
    const { manifest, diagnostics } = parseExtensionManifest(VALID);
    expect(diagnostics).toEqual([]);
    expect(manifest?.id).toBe("note-stats");
    expect(manifest?.contributes.panels[0]?.side).toBe("right");
  });

  it("defaults the optional collections", () => {
    const { manifest, diagnostics } = parseExtensionManifest({
      id: "minimal",
      name: "Minimal",
      version: "1.0.0",
      apiVersion: "^1.0.0"
    });
    expect(diagnostics).toEqual([]);
    expect(manifest?.activationEvents).toEqual([]);
    expect(manifest?.capabilities).toEqual([]);
    expect(manifest?.contributes.commands).toEqual([]);
    expect(manifest?.engines.platform).toEqual(["desktop", "mobile"]);
  });

  it("rejects a non-object", () => {
    const { manifest, diagnostics } = parseExtensionManifest("nope");
    expect(manifest).toBeNull();
    expect(diagnostics[0]?.code).toBe("manifest_not_object");
  });

  it("rejects an id that is not lowercase kebab-case", () => {
    for (const id of ["Note_Stats", "note.stats", "-note", ""]) {
      const { manifest, diagnostics } = parseExtensionManifest({ ...VALID, id });
      expect(manifest).toBeNull();
      expect(diagnostics.some((d) => d.code === "manifest_invalid_id")).toBe(true);
    }
  });

  it("reports every missing required field at once", () => {
    const { manifest, diagnostics } = parseExtensionManifest({ id: "ok" });
    expect(manifest).toBeNull();
    expect(diagnostics.map((d) => d.code)).toContain("manifest_missing_field");
    expect(diagnostics.length).toBeGreaterThanOrEqual(3);
  });

  it("rejects contributed ids that are not relative kebab-case", () => {
    const { manifest, diagnostics } = parseExtensionManifest({
      ...VALID,
      contributes: { commands: [{ id: "note-stats.show", title: "x" }], panels: [] }
    });
    expect(manifest).toBeNull();
    expect(diagnostics.some((d) => d.code === "manifest_invalid_contribution_id")).toBe(true);
  });

  it("rejects an unknown platform", () => {
    const { diagnostics } = parseExtensionManifest({
      ...VALID,
      engines: { platform: ["toaster"] }
    });
    expect(diagnostics.some((d) => d.code === "manifest_invalid_platform")).toBe(true);
  });

  it("warns about an unknown activation event without rejecting the manifest", () => {
    // `onLanguage` is in the epic but has no trigger point yet. A warning keeps
    // adding it later from being a breaking manifest change.
    const { manifest, diagnostics } = parseExtensionManifest({
      ...VALID,
      activationEvents: ["onLanguage:markdown"]
    });
    expect(manifest).not.toBeNull();
    expect(diagnostics.some((d) => d.code === "manifest_unknown_activation_event")).toBe(true);
    expect(diagnostics.every((d) => d.severity === "warning")).toBe(true);
  });

  it("ignores unknown top-level fields without complaint", () => {
    const { manifest, diagnostics } = parseExtensionManifest({ ...VALID, futureField: 1 });
    expect(diagnostics).toEqual([]);
    expect(manifest).not.toBeNull();
  });
});
