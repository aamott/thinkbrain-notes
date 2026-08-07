import { describe, expect, it } from "vitest";

import { evaluateCompatibility } from "./compatibility";
import type { ExtensionManifest } from "./manifest";

const manifest = (overrides: Partial<ExtensionManifest> = {}): ExtensionManifest => ({
  id: "sample",
  name: "Sample",
  version: "1.0.0",
  apiVersion: "^1.0.0",
  engines: { platform: ["desktop", "mobile"] },
  activationEvents: [],
  capabilities: [],
  contributes: { commands: [], panels: [] },
  ...overrides
});

const host = {
  apiVersion: "1.2.0",
  platform: "desktop" as const,
  capabilities: ["commands", "panels"]
};

describe("evaluateCompatibility", () => {
  it("accepts a manifest inside the supported api range", () => {
    expect(evaluateCompatibility(manifest(), host)).toEqual({ compatible: true, reasons: [] });
  });

  it("rejects an api version outside the range", () => {
    const result = evaluateCompatibility(manifest({ apiVersion: "^2.0.0" }), host);
    expect(result.compatible).toBe(false);
    expect(result.reasons[0]?.code).toBe("api-version");
  });

  it("accepts tilde, exact, and wildcard ranges", () => {
    expect(evaluateCompatibility(manifest({ apiVersion: "~1.2.0" }), host).compatible).toBe(true);
    expect(evaluateCompatibility(manifest({ apiVersion: "1.2.0" }), host).compatible).toBe(true);
    expect(evaluateCompatibility(manifest({ apiVersion: "*" }), host).compatible).toBe(true);
    expect(evaluateCompatibility(manifest({ apiVersion: "~1.3.0" }), host).compatible).toBe(false);
  });

  it("rejects an unsupported range syntax rather than guessing", () => {
    const result = evaluateCompatibility(manifest({ apiVersion: ">=1.0.0 <2" }), host);
    expect(result.compatible).toBe(false);
    expect(result.reasons[0]?.code).toBe("api-version");
  });

  it("rejects a platform the host is not", () => {
    const result = evaluateCompatibility(manifest({ engines: { platform: ["mobile"] } }), host);
    expect(result.compatible).toBe(false);
    expect(result.reasons[0]?.code).toBe("platform");
  });

  it("warns about an unsupported capability but stays compatible", () => {
    // Capabilities are compatibility hints, never permissions: an unknown one
    // must not block loading.
    const result = evaluateCompatibility(manifest({ capabilities: ["terminal"] }), host);
    expect(result.compatible).toBe(true);
    expect(result.reasons[0]).toMatchObject({ code: "capability", severity: "warning" });
  });

  it("reports every problem rather than stopping at the first", () => {
    const result = evaluateCompatibility(
      manifest({
        apiVersion: "^9.0.0",
        engines: { platform: ["mobile"] },
        capabilities: ["terminal"]
      }),
      host
    );
    expect(result.reasons.map((r) => r.code).sort()).toEqual([
      "api-version",
      "capability",
      "platform"
    ]);
  });
});
