import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getWorkspaceBridge,
  setWorkspaceBridge,
  subscribeWorkspaceBridge,
  type WorkspaceBridge
} from "./workspaceBridge";

const bridge = (rootPath: string | null): WorkspaceBridge => ({
  rootPath,
  openNote: () => undefined,
  openTab: () => undefined
});

afterEach(() => {
  setWorkspaceBridge(null);
});

describe("subscribeWorkspaceBridge", () => {
  it("fires when the workspace root changes, with the new bridge already set", () => {
    const listener = vi.fn();
    const subscription = subscribeWorkspaceBridge(listener);

    setWorkspaceBridge(bridge("/vault"));

    // The listener sees the new surface, not the one being replaced.
    expect(getWorkspaceBridge()?.rootPath).toBe("/vault");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]?.rootPath).toBe("/vault");

    void subscription.dispose();
  });

  it("does not fire when a republish keeps the same root", () => {
    setWorkspaceBridge(bridge("/vault"));
    const listener = vi.fn();
    const subscription = subscribeWorkspaceBridge(listener);

    setWorkspaceBridge(bridge("/vault"));

    expect(listener).not.toHaveBeenCalled();
    void subscription.dispose();
  });

  it("stops firing once disposed", () => {
    const listener = vi.fn();
    const subscription = subscribeWorkspaceBridge(listener);
    void subscription.dispose();

    setWorkspaceBridge(bridge("/vault"));

    expect(listener).not.toHaveBeenCalled();
  });
});
