// @vitest-environment happy-dom
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  adjustUiScale,
  clampUiScale,
  resetUiScale,
  UI_SCALE_KEY,
  useUiScale
} from "./useUiScale";
import { useSettingsStore, appSettingsRegistry } from "../settings/settingsStore";
import { installStageChangeSpy, seedSettingsStore } from "../settings/settingsTestHelpers";
import {
  clearScrollAnchorSnapshots,
  SCROLL_ANCHOR_ATTR,
  useScrollAnchor
} from "./scrollAnchors";

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
  clearScrollAnchorSnapshots();
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

  it("anchors a registered scroller through repeated scale changes without an intermediate reset", async () => {
    seedSettingsStore({ appValues: { "ui.scale": 110 } });
    // The row's content position tracks the root font size — the mock reads
    // the live style so the layout effect's capture/restore sees the reflow.
    const rowOffset = (): number => {
      const px = Number.parseFloat(document.documentElement.style.fontSize || "16");
      return 60 * (px / 16);
    };
    const rectAt = (top: number, height = 20) =>
      ({ top, bottom: top + height, left: 0, right: 200, height, width: 200, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    const Both = () => {
      useUiScale();
      const ref = useRef<HTMLDivElement>(null);
      useScrollAnchor(ref, "ui-scale-test");
      return (
        <div ref={ref}>
          <div {...{ [SCROLL_ANCHOR_ATTR]: "row.x" }} />
        </div>
      );
    };
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root!.render(<Both />));
    const scroller = container.firstElementChild as HTMLElement;
    const row = scroller.firstElementChild as HTMLElement;
    Object.defineProperty(scroller, "clientHeight", { value: 500, configurable: true });
    scroller.getBoundingClientRect = () => rectAt(0, 500);
    row.getBoundingClientRect = () => rectAt(rowOffset() - scroller.scrollTop);
    scroller.scrollTop = 40;
    await act(async () => {
      scroller.dispatchEvent(new Event("scroll"));
    });
    expect(document.documentElement.style.fontSize).toBe("17.6px");

    const stage = async (next: number): Promise<void> => {
      await act(async () => {
        useSettingsStore.getState().stageChange(UI_SCALE_KEY, next);
      });
    };
    await stage(125);
    // Anchor lands back at its captured offset: drift = 75 - 66.
    expect(document.documentElement.style.fontSize).toBe("20px");
    expect(scroller.scrollTop).toBe(49);
    await stage(100);
    expect(document.documentElement.style.fontSize).toBe("16px");
    await stage(110);
    // The font size is never blanked between writes — only unmount resets it.
    expect(document.documentElement.style.fontSize).toBe("17.6px");
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

  it("resets to the coarse-pointer definition default of 110", () => {
    const original = appSettingsRegistry.getDefinition.bind(appSettingsRegistry);
    const getSpy = vi
      .spyOn(appSettingsRegistry, "getDefinition")
      .mockImplementation(((key: string) => {
        const definition = original(key);
        return key === UI_SCALE_KEY && definition
          ? { ...definition, default: 110 }
          : definition;
      }) as typeof appSettingsRegistry.getDefinition);
    try {
      seedSettingsStore({ appValues: { "ui.scale": 140 } });
      const spy = installStageChangeSpy();
      resetUiScale();
      expect(spy).toHaveBeenCalledWith(UI_SCALE_KEY, 110);
    } finally {
      getSpy.mockRestore();
    }
  });
});
