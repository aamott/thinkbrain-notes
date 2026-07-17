import { describe, expect, it } from "vitest";

import { getUnavailableMessage } from "./shellTypes";
import { indexingText, nativeShellText } from "./statusText";

describe("shell unavailable notices", () => {
  it("keeps ownership messages specific to the unavailable feature", () => {
    expect(getUnavailableMessage("sourceControl")).toContain("Git integration");
    expect(getUnavailableMessage("assistant")).toContain("AI");
    expect(getUnavailableMessage("theme")).toContain("Settings");
  });
});

describe("shell status text", () => {
  it("reports native failures and indexing progress without mock data", () => {
    expect(nativeShellText({ status: "checking" })).toBe("Checking desktop shell…");
    expect(
      nativeShellText({
        status: "error",
        error: { code: "native.offline", message: "Bridge unavailable" }
      })
    ).toContain("native.offline");
    expect(
      indexingText({ status: "indexing", indexed: 4, total: 9, error: null })
    ).toBe("Indexing notes: 4/9");
  });
});
