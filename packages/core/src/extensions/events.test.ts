import { describe, expect, it, vi } from "vitest";

import { createEventBus } from "./events";

interface TestEvents {
  "note.saved": { readonly relativePath: string };
  "workspace.opened": { readonly rootPath: string };
}

describe("createEventBus", () => {
  it("delivers a payload to subscribers of that event only", () => {
    const bus = createEventBus<TestEvents>();
    const onSaved = vi.fn();
    const onOpened = vi.fn();
    bus.on("note.saved", onSaved);
    bus.on("workspace.opened", onOpened);

    bus.emit("note.saved", { relativePath: "a.md" });

    expect(onSaved).toHaveBeenCalledWith({ relativePath: "a.md" });
    expect(onOpened).not.toHaveBeenCalled();
  });

  it("stops delivering after the subscription is disposed", () => {
    const bus = createEventBus<TestEvents>();
    const listener = vi.fn();
    const subscription = bus.on("note.saved", listener);

    subscription.dispose();
    subscription.dispose();
    bus.emit("note.saved", { relativePath: "a.md" });

    expect(listener).not.toHaveBeenCalled();
  });

  /**
   * One extension's broken listener must not swallow the event for others —
   * failure isolation is the point of routing events through the bus.
   */
  it("keeps delivering when an earlier listener throws", () => {
    const onListenerError = vi.fn();
    const bus = createEventBus<TestEvents>(onListenerError);
    const failure = new Error("broken listener");
    const following = vi.fn();
    bus.on("note.saved", () => {
      throw failure;
    });
    bus.on("note.saved", following);

    bus.emit("note.saved", { relativePath: "a.md" });

    expect(following).toHaveBeenCalledWith({ relativePath: "a.md" });
    expect(onListenerError).toHaveBeenCalledWith("note.saved", failure);
  });

  it("does not deliver the current event to a listener subscribed during it", () => {
    const bus = createEventBus<TestEvents>();
    const late = vi.fn();
    bus.on("note.saved", () => {
      bus.on("note.saved", late);
    });

    bus.emit("note.saved", { relativePath: "a.md" });
    expect(late).not.toHaveBeenCalled();

    bus.emit("note.saved", { relativePath: "b.md" });
    expect(late).toHaveBeenCalledTimes(1);
  });
});
