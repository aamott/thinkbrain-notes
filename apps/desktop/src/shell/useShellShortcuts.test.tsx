// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DesktopCommandContext } from "../commands/commandRegistry";
import { createEditorTab, initialDesktopTabState, type DesktopTabAction } from "../tabs/tabModel";
import { appSettingsRegistry, useSettingsStore } from "../settings/settingsStore";
import { useCommandSurface } from "./useShellCommands";
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

// The mounted chrome's command surface — the same registration `PhoneShell`
// installs — so shortcuts can be proven to honour it rather than always
// dispatching the desktop tab-history action.
const SurfaceProbe = ({ surface }: { readonly surface: Partial<DesktopCommandContext> }) => {
  useCommandSurface(surface);
  return null;
};

const mount = async (
  props: Partial<ShellShortcutsProps> = {},
  surface?: Partial<DesktopCommandContext>
): Promise<void> => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      <>
        <Probe {...props} />
        {surface ? <SurfaceProbe surface={surface} /> : null}
      </>
    )
  );
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
  vi.restoreAllMocks();
});

describe("useShellShortcuts tab cycling", () => {
  const tabs = ["a", "b", "c"].map((name) =>
    createEditorTab({ rootPath: "/notes", relativePath: `${name}.md` })
  );

  it("cycles forward/reverse from editable targets and prevents default", async () => {
    dispatchTabs = vi.fn();
    await mount({ tabState: { ...initialDesktopTabState, tabs, activeTabId: tabs[0]!.id } });
    const input = document.createElement("input");
    document.body.append(input);
    const forward = new KeyboardEvent("keydown", { key: "Tab", ctrlKey: true, bubbles: true, cancelable: true });
    await act(async () => { input.dispatchEvent(forward); });
    expect(forward.defaultPrevented).toBe(true);
    await keydown({ key: "Tab", ctrlKey: true, shiftKey: true }, input);
    input.remove();
    expect(dispatchTabs).toHaveBeenNthCalledWith(1, { type: "activate", tabId: tabs[1]!.id });
    expect(dispatchTabs).toHaveBeenNthCalledWith(2, { type: "activate", tabId: tabs[2]!.id });
  });

  it("reads the registered setting at keypress time, including the explicit MRU fallback", async () => {
    expect(appSettingsRegistry.getDefinition("editor.tabCycleOrder")?.default).toBe("tab order");
    const getEffectiveValue = vi.spyOn(useSettingsStore.getState(), "getEffectiveValue");
    getEffectiveValue.mockReturnValue("last visited");
    dispatchTabs = vi.fn();
    await mount({ tabState: { ...initialDesktopTabState, tabs, activeTabId: tabs[1]!.id } });
    await keydown({ key: "Tab", ctrlKey: true });
    expect(getEffectiveValue).toHaveBeenCalledWith("editor.tabCycleOrder");
    expect(dispatchTabs).toHaveBeenCalledExactlyOnceWith({ type: "activate", tabId: tabs[2]!.id });
  });

  it("ignores bare Tab and Alt-modified chords and safely handles no tabs", async () => {
    dispatchTabs = vi.fn();
    await mount();
    await keydown({ key: "Tab" });
    await keydown({ key: "Tab", ctrlKey: true, altKey: true });
    await keydown({ key: "Tab", ctrlKey: true });
    expect(dispatchTabs).not.toHaveBeenCalled();
  });
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

  it("routes every history gesture through the mounted command surface", async () => {
    dispatchTabs = vi.fn();
    const goBack = vi.fn();
    const goForward = vi.fn();
    await mount({}, { goBack, goForward });

    await keydown({ key: "ArrowLeft", altKey: true });
    await keydown({ key: "ArrowRight", altKey: true });
    await keydown({ key: "[", metaKey: true });
    await keydown({ key: "]", ctrlKey: true });
    await mouseup(3);
    await mouseup(4);

    // Keyboard, brackets and thumb buttons all land on the chrome's own
    // navigation — the tab-history dispatch stays untouched.
    expect(goBack).toHaveBeenCalledTimes(3);
    expect(goForward).toHaveBeenCalledTimes(3);
    expect(dispatchTabs).not.toHaveBeenCalled();
  });

  it("falls back to the tab dispatch when no chrome surface is mounted", async () => {
    dispatchTabs = vi.fn();
    await mount();

    await keydown({ key: "ArrowLeft", altKey: true });

    expect(dispatchTabs).toHaveBeenCalledWith({ type: "goBack" });
  });

  it("leaves Shift+Alt arrows to selection, never navigation", async () => {
    dispatchTabs = vi.fn();
    const goBack = vi.fn();
    await mount({}, { goBack });

    await keydown({ key: "ArrowLeft", altKey: true, shiftKey: true });

    expect(goBack).not.toHaveBeenCalled();
    expect(dispatchTabs).not.toHaveBeenCalled();
  });

  it("leaves Ctrl/Cmd+[/] inside editable fields to the editor", async () => {
    dispatchTabs = vi.fn();
    const goBack = vi.fn();
    const goForward = vi.fn();
    await mount({}, { goBack, goForward });

    const editable = document.createElement("div");
    editable.contentEditable = "true";
    document.body.appendChild(editable);
    await keydown({ key: "[", ctrlKey: true }, editable);
    await keydown({ key: "]", metaKey: true }, editable);
    editable.remove();

    expect(goBack).not.toHaveBeenCalled();
    expect(goForward).not.toHaveBeenCalled();
    expect(dispatchTabs).not.toHaveBeenCalled();
  });
});
