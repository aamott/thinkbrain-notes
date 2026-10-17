import { describe, expect, it } from "vitest";
import { nextCycledTabId, type TabCycleOrder } from "./tabCycle";

const tabs = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("tab cycling", () => {
  it("cycles in strip order in either direction and wraps", () => {
    expect(nextCycledTabId(tabs, "a", "tab order", 1)).toBe("b");
    expect(nextCycledTabId(tabs, "b", "tab order", -1)).toBe("a");
    expect(nextCycledTabId(tabs, "c", "tab order", 1)).toBe("a");
    expect(nextCycledTabId(tabs, "a", "tab order", -1)).toBe("c");
  });

  it("follows reordered tabs without mutating the input", () => {
    const reordered = [tabs[2]!, tabs[0]!, tabs[1]!];
    expect(nextCycledTabId(reordered, "c", "tab order", 1)).toBe("a");
    expect(reordered).toEqual([tabs[2], tabs[0], tabs[1]]);
  });

  it("explicitly falls back to strip order for the unimplemented MRU mode", () => {
    expect(nextCycledTabId(tabs, "b", "last visited", 1)).toBe("c");
    expect(nextCycledTabId(tabs, "a", "last visited", -1)).toBe("c");
  });

  it.each<TabCycleOrder>(["tab order", "last visited"])("handles empty, single, and missing selection in %s mode", (mode) => {
    expect(nextCycledTabId([], null, mode, 1)).toBeNull();
    expect(nextCycledTabId([tabs[0]!], "a", mode, -1)).toBeNull();
    expect(nextCycledTabId(tabs, null, mode, 1)).toBe("a");
    expect(nextCycledTabId(tabs, "missing", mode, -1)).toBe("c");
  });
});
