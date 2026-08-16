import { describe, expect, it } from "vitest";

import { parseActivationEvent } from "./activation";

describe("parseActivationEvent", () => {
  it("parses onStartup", () => {
    expect(parseActivationEvent("onStartup")).toEqual({ kind: "startup" });
  });

  it("parses onCommand and onView with relative ids", () => {
    expect(parseActivationEvent("onCommand:show")).toEqual({ kind: "command", id: "show" });
    expect(parseActivationEvent("onView:stats")).toEqual({ kind: "view", id: "stats" });
  });

  it("rejects an unknown event kind", () => {
    expect(parseActivationEvent("onLanguage:markdown")).toBeNull();
  });

  it("rejects a prefixed id, which is a common authoring mistake", () => {
    expect(parseActivationEvent("onCommand:note-stats.show")).toBeNull();
  });

  it("rejects a missing id", () => {
    expect(parseActivationEvent("onCommand:")).toBeNull();
    expect(parseActivationEvent("onCommand")).toBeNull();
  });
});
