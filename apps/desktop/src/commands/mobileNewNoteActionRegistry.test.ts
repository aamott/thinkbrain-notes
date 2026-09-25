import { describe, expect, it, vi } from "vitest";

import {
  createMobileNewNoteActionRegistry,
  type MobileNewNoteAction
} from "./mobileNewNoteActionRegistry";

const action = (id: string, commandId = `cmd-${id}`): MobileNewNoteAction => ({
  id,
  commandId,
  label: `Action ${id}`,
  icon: "plus"
});

describe("mobileNewNoteActionRegistry", () => {
  it("preserves registration order", () => {
    const registry = createMobileNewNoteActionRegistry();
    registry.register(action("first"));
    registry.register(action("second"));
    registry.register(action("third"));

    expect(registry.entries().map((entry) => entry.id)).toEqual([
      "first",
      "second",
      "third"
    ]);
  });

  it("rejects a duplicate id loudly", () => {
    const registry = createMobileNewNoteActionRegistry([action("a")]);

    expect(() => registry.register(action("a"))).toThrow(/already registered/);
  });

  it("notifies subscribers on register and dispose", () => {
    const registry = createMobileNewNoteActionRegistry();
    const listener = vi.fn();
    registry.subscribe(listener);

    const disposable = registry.register(action("a"));
    expect(listener).toHaveBeenCalledTimes(1);
    disposable.dispose();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("removes the action on disposal so nothing stale remains", () => {
    const registry = createMobileNewNoteActionRegistry();
    const disposable = registry.register(action("a"));

    expect(registry.get("a")).toBeDefined();
    disposable.dispose();
    expect(registry.get("a")).toBeUndefined();
    expect(registry.entries()).toHaveLength(0);
  });
});
