// @vitest-environment happy-dom
/**
 * The hub's persistence seam.
 *
 * `setSettingImmediately` is mocked rather than spied: ESM exports are not
 * writable under Vite, so a spy would silently run the real store and reach for
 * the native settings gateway.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_HUB_ITEMS } from "./hubModel";
import { useHubItems } from "./useHubItems";

// `vi.mock` is hoisted above the imports, and its factory runs while
// `./useHubItems` is being imported — before any plain `const` in this file has
// initialized. `vi.hoisted` is what makes the spy exist by then.
const { setSettingImmediately, state } = vi.hoisted(() => ({
  setSettingImmediately: vi.fn<(key: string, value: unknown) => Promise<void>>(async () => undefined),
  state: { stored: "" as unknown }
}));

vi.mock("../../settings/settingsStore", () => {
  const snapshot = {
    getEffectiveValue: (): unknown => state.stored,
    setSettingImmediately
  };
  return {
    useSettingsStore: Object.assign(
      (selector: (value: typeof snapshot) => unknown) => selector(snapshot),
      { getState: () => snapshot }
    )
  };
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  setSettingImmediately.mockClear();
  setSettingImmediately.mockImplementation(async () => undefined);
  state.stored = "";
  root = null;
  container = null;
});

const renderHook = async (): Promise<() => ReturnType<typeof useHubItems>> => {
  let latest: ReturnType<typeof useHubItems> | null = null;
  const Probe = (): null => {
    latest = useHubItems();
    return null;
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<Probe />));
  return () => {
    if (!latest) throw new Error("useHubItems did not render");
    return latest;
  };
};

describe("useHubItems", () => {
  it("returns the defaults when nothing is stored", async () => {
    const hook = await renderHook();

    expect(hook().items).toEqual(DEFAULT_HUB_ITEMS);
  });

  it("returns the stored shortcuts", async () => {
    state.stored = '[{"kind":"panel","id":"search"},{"kind":"menu"}]';

    const hook = await renderHook();

    expect(hook().items).toEqual([{ kind: "panel", id: "search" }, { kind: "menu" }]);
  });

  /**
   * A hub that fails to load is a phone with no way to navigate, so a corrupt
   * or wrong-typed preference has to degrade to the defaults rather than throw.
   */
  it("falls back to the defaults when the stored value is unusable", async () => {
    for (const bad of ['[{"kind":', "{}", "[]", 42]) {
      state.stored = bad;
      const hook = await renderHook();
      expect(hook().items).toEqual(DEFAULT_HUB_ITEMS);
      await act(async () => root?.unmount());
      container?.remove();
      root = null;
      container = null;
    }
  });

  it("writes serialized items to ui.mobileHub", async () => {
    const hook = await renderHook();

    await act(async () => hook().setItems([{ kind: "menu" }]));

    expect(setSettingImmediately).toHaveBeenCalledWith("ui.mobileHub", '[{"kind":"menu"}]');
  });

  /**
   * The store's own `setSettingImmediately` resolves even when the write fails,
   * so this only pins that the hook adds no swallowing of its own.
   */
  it("propagates a rejected write to the caller", async () => {
    setSettingImmediately.mockRejectedValueOnce(new Error("disk full"));
    const hook = await renderHook();

    await expect(hook().setItems([{ kind: "menu" }])).rejects.toThrow("disk full");
  });
});
