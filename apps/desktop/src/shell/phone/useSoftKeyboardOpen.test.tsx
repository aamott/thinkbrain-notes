// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSoftKeyboardOpen } from "./useSoftKeyboardOpen";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
  root = null;
  container = null;
});

const renderOpen = async (): Promise<() => boolean> => {
  let latest = false;
  const Probe = (): null => {
    latest = useSoftKeyboardOpen();
    return null;
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<Probe />));
  return () => latest;
};

/** Fires a bubbling focus transition the way the browser would. */
const focus = async (
  from: Element | null,
  to: Element | null
): Promise<void> => {
  await act(async () => {
    from?.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: to }));
    to?.dispatchEvent(new FocusEvent("focusin", { bubbles: true, relatedTarget: from }));
  });
};

/**
 * The Android `adjustResize` fixture: no visualViewport delta to measure, so
 * the honest signals are editable focus plus the WebView itself having
 * shrunk (800px screen, 500px viewport = a keyboard eating 300px).
 */
const stubKeyboardShrunkViewport = (): void => {
  vi.stubGlobal("visualViewport", undefined);
  vi.stubGlobal("screen", { height: 800 });
  vi.stubGlobal("innerHeight", 500);
};

describe("useSoftKeyboardOpen", () => {
  it("is closed while nothing editable holds focus", async () => {
    vi.stubGlobal("visualViewport", undefined);

    const open = await renderOpen();

    expect(open()).toBe(false);
  });

  it("opens when an input takes focus under a shrunk viewport", async () => {
    stubKeyboardShrunkViewport();
    const open = await renderOpen();
    const input = document.createElement("input");
    document.body.append(input);

    await focus(null, input);

    expect(open()).toBe(true);
    input.remove();
  });

  it("counts a contenteditable and CodeMirror's .cm-content as editable", async () => {
    stubKeyboardShrunkViewport();
    const open = await renderOpen();
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    const cm = document.createElement("div");
    cm.className = "cm-content";
    document.body.append(editable, cm);

    await focus(null, editable);
    expect(open()).toBe(true);
    await focus(editable, cm);
    expect(open()).toBe(true);

    editable.remove();
    cm.remove();
  });

  it("does not flicker while focus moves between editables", async () => {
    stubKeyboardShrunkViewport();
    const open = await renderOpen();
    const input = document.createElement("input");
    const area = document.createElement("textarea");
    document.body.append(input, area);

    await focus(null, input);
    expect(open()).toBe(true);

    // focusout's relatedTarget is the incoming editable: no close in between.
    await focus(input, area);
    expect(open()).toBe(true);

    input.remove();
    area.remove();
  });

  it("closes when focus leaves for a non-editable or nowhere", async () => {
    stubKeyboardShrunkViewport();
    const open = await renderOpen();
    const input = document.createElement("input");
    const button = document.createElement("button");
    document.body.append(input, button);
    await focus(null, input);
    expect(open()).toBe(true);

    await focus(input, button);
    expect(open()).toBe(false);

    // And a blur to nothing (keyboard dismissed without a new focus target).
    await focus(button, input);
    expect(open()).toBe(true);
    await focus(input, null);
    expect(open()).toBe(false);

    input.remove();
    button.remove();
  });

  it("closes when the keyboard is dismissed but the editor keeps focus — Android Back", async () => {
    // The regression this guards: Back drops the keyboard without blurring
    // `.cm-content`, so focus alone cannot mean "keyboard open".
    stubKeyboardShrunkViewport();
    const open = await renderOpen();
    const input = document.createElement("input");
    document.body.append(input);
    await focus(null, input);
    expect(open()).toBe(true);

    // The WebView grows back; no focusout ever arrives.
    vi.stubGlobal("innerHeight", 800);
    await act(async () => window.dispatchEvent(new Event("resize")));

    expect(open()).toBe(false);
    input.remove();
  });

  it("does not open for a focused editable while the viewport is full height", async () => {
    // Focused with no keyboard — e.g. a hardware keyboard, or the beat
    // before the OSK animates in — must not hide the bubbles.
    vi.stubGlobal("visualViewport", undefined);
    vi.stubGlobal("screen", { height: 800 });
    vi.stubGlobal("innerHeight", 800);
    const open = await renderOpen();
    const input = document.createElement("input");
    document.body.append(input);

    await focus(null, input);

    expect(open()).toBe(false);
    input.remove();
  });

  it("also opens on a positive visualViewport delta — the iOS signal", async () => {
    // iOS shrinks the visual viewport without a matching layout resize, so
    // a 300px gap means the keyboard is up even with nothing focused.
    vi.stubGlobal("innerHeight", 800);
    vi.stubGlobal("visualViewport", {
      height: 500,
      offsetTop: 0,
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    });

    const open = await renderOpen();

    expect(open()).toBe(true);
  });
});
