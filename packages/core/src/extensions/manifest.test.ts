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

  it("carries the optional entry module path", () => {
    const { manifest, diagnostics } = parseExtensionManifest({ ...VALID, main: "dist/main.js" });

    expect(diagnostics).toEqual([]);
    expect(manifest?.main).toBe("dist/main.js");
  });

  it("leaves main undefined for a built-in that ships no entry file", () => {
    const { manifest } = parseExtensionManifest(VALID);

    expect(manifest?.main).toBeUndefined();
  });

  it("reports a non-string main", () => {
    const { manifest, diagnostics } = parseExtensionManifest({ ...VALID, main: 7 });

    expect(manifest).toBeNull();
    expect(diagnostics.some((d) => d.code === "manifest_invalid_field")).toBe(true);
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

  it("rejects duplicate contribution ids within a kind", () => {
    // A repeated id would throw halfway through stub registration, so it must
    // fail loudly here, at parse time.
    const { manifest, diagnostics } = parseExtensionManifest({
      ...VALID,
      contributes: {
        commands: [
          { id: "show", title: "Show" },
          { id: "hide", title: "Hide" },
          { id: "show", title: "Show again" }
        ],
        panels: [
          { id: "stats", label: "Stats", icon: "∑", side: "left" },
          { id: "stats", label: "Stats again", icon: "∑", side: "right" }
        ]
      }
    });
    expect(manifest).toBeNull();
    expect(
      diagnostics.filter((d) => d.code === "manifest_duplicate_contribution_id")
    ).toHaveLength(2);
  });

  it("allows the same relative id for a command and a panel", () => {
    const { manifest, diagnostics } = parseExtensionManifest({
      ...VALID,
      contributes: {
        commands: [{ id: "capture", title: "Capture" }],
        panels: [{ id: "capture", label: "Capture", icon: "C", side: "right" }]
      }
    });
    expect(diagnostics).toEqual([]);
    expect(manifest).not.toBeNull();
  });

  it("reports a present-but-malformed engines field instead of defaulting silently", () => {
    for (const engines of ["desktop", 5, ["desktop"]]) {
      const { manifest, diagnostics } = parseExtensionManifest({ ...VALID, engines });
      expect(manifest).toBeNull();
      expect(
        diagnostics.some(
          (d) => d.code === "manifest_invalid_field" && d.message.includes('"engines"')
        )
      ).toBe(true);
    }
  });

  it("reports non-array contributes.commands and contributes.panels", () => {
    const { manifest, diagnostics } = parseExtensionManifest({
      ...VALID,
      contributes: { commands: "show", panels: { id: "stats" } }
    });
    expect(manifest).toBeNull();
    expect(
      diagnostics.filter((d) => d.code === "manifest_invalid_field").map((d) => d.message)
    ).toEqual([
      '"contributes.commands" must be an array.',
      '"contributes.panels" must be an array.'
    ]);
  });

  it("warns about activation events the parser cannot trigger", () => {
    // The manifest check must match `parseActivationEvent` exactly: a looser
    // pattern would pass ids that are then silently dead at runtime.
    for (const event of ["onCommand:show-", "onCommand:a--b", "onView:UPPER"]) {
      const { manifest, diagnostics } = parseExtensionManifest({
        ...VALID,
        activationEvents: [event]
      });
      expect(manifest).not.toBeNull();
      expect(diagnostics.some((d) => d.code === "manifest_unknown_activation_event")).toBe(
        true
      );
    }
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
