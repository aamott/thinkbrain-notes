// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  adjustUiScale,
  clampUiScale,
  resetUiScale,
  UI_SCALE_KEY,
  useUiScale
} from "./useUiScale";
import { useSettingsStore } from "../settings/settingsStore";
import { installStageChangeSpy, seedSettingsStore } from "../settings/settingsTestHelpers";

// Minimal harness: one host div, a component that only mounts the hook.
let container: HTMLDivElement | null = null;
let root: Root | null = null;

const Probe = () => {
  useUiScale();
  return null;
};

const mount = async (): Promise<void> => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<Probe />));
};

const press = async (code: string, init: Partial<KeyboardEventInit> = {}): Promise<void> => {
  await act(async () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { code, ctrlKey: true, cancelable: true, ...init })
    );
  });
};

beforeEach(() => {
  seedSettingsStore();
  document.documentElement.style.fontSize = "";
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  container?.remove();
  container = null;
  document.documentElement.style.fontSize = "";
  vi.restoreAllMocks();
});

describe("clampUiScale", () => {
  it("clamps to the setting's bounds and falls back to 100", () => {
    expect(clampUiScale(10)).toBe(50);
    expect(clampUiScale(999)).toBe(200);
    expect(clampUiScale("big")).toBe(100);
    expect(clampUiScale(112.6)).toBe(113);
  });
});

describe("useUiScale", () => {
  it("applies the default 100% as a 16px root font size", async () => {
    await mount();
    expect(document.documentElement.style.fontSize).toBe("16px");
  });

  it("applies a seeded scale as a proportional root font size", async () => {
    seedSettingsStore({ appValues: { "ui.scale": 120 } });
    await mount();
    expect(document.documentElement.style.fontSize).toBe("19.2px");
  });

  it("reacts to staged changes — the Settings control path", async () => {
    await mount();
    installStageChangeSpy(true);
    await act(async () => {
      useSettingsStore.getState().stageChange(UI_SCALE_KEY, 150);
    });
    expect(document.documentElement.style.fontSize).toBe("24px");
  });

  it("Ctrl+= stages a +10 bump through the same store path", async () => {
    const spy = installStageChangeSpy(true);
    await mount();
    await press("Equal");
    expect(spy).toHaveBeenCalledWith(UI_SCALE_KEY, 110);
    expect(document.documentElement.style.fontSize).toBe("17.6px");
  });

  it("Ctrl+- stages a -10 bump and clamps at the lower bound", async () => {
    seedSettingsStore({ appValues: { "ui.scale": 55 } });
    const spy = installStageChangeSpy(true);
    await mount();
    await press("Minus");
    expect(spy).toHaveBeenCalledWith(UI_SCALE_KEY, 50);
  });

  it("Ctrl+0 resets to 100", async () => {
    seedSettingsStore({ appValues: { "ui.scale": 140 } });
    const spy = installStageChangeSpy(true);
    await mount();
    await press("Digit0");
    expect(spy).toHaveBeenCalledWith(UI_SCALE_KEY, 100);
  });

  it("accepts the numpad equivalents", async () => {
    const spy = installStageChangeSpy(true);
    await mount();
    await press("NumpadAdd");
    await press("NumpadSubtract");
    await press("Numpad0");
    expect(spy).toHaveBeenNthCalledWith(1, UI_SCALE_KEY, 110);
    expect(spy).toHaveBeenNthCalledWith(2, UI_SCALE_KEY, 100);
    expect(spy).toHaveBeenNthCalledWith(3, UI_SCALE_KEY, 100);
  });

  it("ignores the keys without a modifier and unmodified keys with one", async () => {
    const spy = installStageChangeSpy(true);
    await mount();
    await press("Equal", { ctrlKey: false });
    await press("KeyQ");
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("adjustUiScale / resetUiScale", () => {
  it("adjusts relative to the effective value and resets to the default", () => {
    seedSettingsStore({ appValues: { "ui.scale": 130 } });
    const spy = installStageChangeSpy();
    adjustUiScale(10);
    resetUiScale();
    expect(spy).toHaveBeenNthCalledWith(1, UI_SCALE_KEY, 140);
    expect(spy).toHaveBeenNthCalledWith(2, UI_SCALE_KEY, 100);
  });
});
