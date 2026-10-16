// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { initialDesktopTabState, type DesktopTabAction } from "../tabs/tabModel";
import { useShellShortcuts, type ShellShortcutsProps } from "./useShellShortcuts";

// Minimal harness: mount the hook with stubbed shell plumbing and drive the
// window-level listeners with real KeyboardEvent/MouseEvent dispatches.
let container: HTMLDivElement | null = null;
let root: Root | null = null;
let dispatchTabs: (action: DesktopTabAction) => void;

const Probe = (props: Partial<ShellShortcutsProps>) => {
  useShellShortcuts({
    tabState: initialDesktopTabState,
    dispatchTabs,
    activeTab: null,
    paletteOpen: false,
    openPalette: () => undefined,
    closePalette: () => undefined,
    selectLeftPanel: () => undefined,
    toggleBottomPanel: () => undefined,
    saveDocument: () => Promise.resolve(true),
    ...props
  });
  return null;
};

const mount = async (props: Partial<ShellShortcutsProps> = {}): Promise<void> => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<Probe {...props} />));
};

const keydown = async (init: KeyboardEventInit, target: EventTarget = window): Promise<void> => {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  });
};

const mouseup = async (button: number, target: EventTarget = window): Promise<void> => {
  await act(async () => {
    target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, button }));
  });
};

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  container?.remove();
  container = null;
});

describe("useShellShortcuts history navigation", () => {
  it("walks history on Alt+Left/Right", async () => {
    dispatchTabs = vi.fn();
    await mount();

    await keydown({ key: "ArrowLeft", altKey: true });
    await keydown({ key: "ArrowRight", altKey: true });

    expect(dispatchTabs).toHaveBeenNthCalledWith(1, { type: "goBack" });
    expect(dispatchTabs).toHaveBeenNthCalledWith(2, { type: "goForward" });
  });

  it("walks history on Ctrl/Cmd+[ and Ctrl/Cmd+]", async () => {
    dispatchTabs = vi.fn();
    await mount();

    await keydown({ key: "[", metaKey: true });
    await keydown({ key: "]", ctrlKey: true });

    expect(dispatchTabs).toHaveBeenNthCalledWith(1, { type: "goBack" });
    expect(dispatchTabs).toHaveBeenNthCalledWith(2, { type: "goForward" });
  });

  it("leaves Alt+Left/Right to editable fields", async () => {
    dispatchTabs = vi.fn();
    await mount();

    const input = document.createElement("input");
    document.body.appendChild(input);
    await keydown({ key: "ArrowLeft", altKey: true }, input);
    input.remove();

    const editable = document.createElement("div");
    editable.contentEditable = "true";
    document.body.appendChild(editable);
    await keydown({ key: "ArrowRight", altKey: true }, editable);
    editable.remove();

    expect(dispatchTabs).not.toHaveBeenCalled();
  });

  it("navigates on mouse thumb buttons and ignores other buttons", async () => {
    dispatchTabs = vi.fn();
    await mount();

    await mouseup(3);
    await mouseup(4);
    await mouseup(0);
    await mouseup(1);
    await mouseup(2);

    expect(dispatchTabs).toHaveBeenNthCalledWith(1, { type: "goBack" });
    expect(dispatchTabs).toHaveBeenNthCalledWith(2, { type: "goForward" });
    expect(dispatchTabs).toHaveBeenCalledTimes(2);
  });
});
