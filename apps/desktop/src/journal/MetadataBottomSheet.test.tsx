// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JournalFieldDefinition } from "@thinkbrain/core";

import { MetadataBottomSheet, type MetadataBottomSheetProps } from "./MetadataBottomSheet";

/**
 * D78's contract, one behaviour per test: it is a named dialog, focus is trapped
 * and returned, all three dismissals land in the note, and values save as they
 * change so `Done` only closes.
 */

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let opener: HTMLButtonElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  opener?.remove();
  root = null;
  container = null;
  opener = null;
});

const DEFINITIONS: readonly JournalFieldDefinition[] = [
  { id: "mood", label: "Mood", type: "single-select", options: ["rough", "okay", "good"] },
  { id: "energy", label: "Energy", type: "number" }
];

const render = async (
  overrides: Partial<MetadataBottomSheetProps> = {}
): Promise<HTMLDivElement> => {
  // A real opener, so "returns focus to the control that opened it" is testable.
  opener = document.createElement("button");
  document.body.append(opener);
  opener.focus();

  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const props: MetadataBottomSheetProps = {
    title: "Friday, August 7",
    definitions: DEFINITIONS,
    values: {},
    onSet: () => undefined,
    onDismiss: () => undefined,
    ...overrides
  };
  await act(async () => root?.render(<MetadataBottomSheet {...props} />));
  return container;
};

// The sheet portals to the body, so it is never inside the render container.
const sheet = (): HTMLElement => {
  const found = document.body.querySelector<HTMLElement>('[role="dialog"]');
  if (!found) throw new Error("The sheet did not render a dialog.");
  return found;
};

const press = async (target: Element, key: string, shiftKey = false): Promise<void> => {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true }));
  });
};

describe("announcing itself (D78)", () => {
  it("is a modal dialog named for the entry's date", async () => {
    await render();

    expect(sheet().getAttribute("aria-modal")).toBe("true");
    expect(sheet().getAttribute("aria-label")).toBe("Friday, August 7");
  });
});

describe("focus (D78)", () => {
  it("moves focus into the sheet when it opens", async () => {
    await render();

    expect(sheet().contains(document.activeElement)).toBe(true);
  });

  it("wraps Tab from the last control back to the first", async () => {
    await render();
    const focusable = [...sheet().querySelectorAll<HTMLElement>("button, input")];
    const last = focusable.at(-1)!;

    await act(async () => last.focus());
    await press(last, "Tab");

    expect(document.activeElement).toBe(focusable[0]);
  });

  it("wraps Shift+Tab from the first control to the last", async () => {
    await render();
    const focusable = [...sheet().querySelectorAll<HTMLElement>("button, input")];

    await act(async () => focusable[0]?.focus());
    await press(focusable[0]!, "Tab", true);

    expect(document.activeElement).toBe(focusable.at(-1));
  });

  it("returns focus to the control that opened it", async () => {
    await render();

    await act(async () => root?.unmount());

    expect(document.activeElement).toBe(opener);
  });
});

describe("dismissing (D78)", () => {
  it("dismisses on the shell's back, which reaches the page as Escape", async () => {
    const onDismiss = vi.fn();
    await render({ onDismiss });

    await press(sheet(), "Escape");

    expect(onDismiss).toHaveBeenCalled();
  });

  it("dismisses when the scrim is tapped", async () => {
    const onDismiss = vi.fn();
    await render({ onDismiss });

    const scrim = document.body.querySelector<HTMLElement>("[data-sheet-scrim]");
    await act(async () => scrim?.click());

    expect(onDismiss).toHaveBeenCalled();
  });

  it("dismisses on a downward swipe", async () => {
    const onDismiss = vi.fn();
    await render({ onDismiss });
    const grabber = document.body.querySelector<HTMLElement>("[data-sheet-grabber]");

    await act(async () => {
      grabber?.dispatchEvent(touch("touchstart", 300));
      grabber?.dispatchEvent(touch("touchmove", 400));
      grabber?.dispatchEvent(touch("touchend", 400));
    });

    expect(onDismiss).toHaveBeenCalled();
  });

  it("ignores a small drag, so a stray thumb does not close it", async () => {
    const onDismiss = vi.fn();
    await render({ onDismiss });
    const grabber = document.body.querySelector<HTMLElement>("[data-sheet-grabber]");

    await act(async () => {
      grabber?.dispatchEvent(touch("touchstart", 300));
      grabber?.dispatchEvent(touch("touchmove", 312));
      grabber?.dispatchEvent(touch("touchend", 312));
    });

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("ignores an upward swipe", async () => {
    const onDismiss = vi.fn();
    await render({ onDismiss });
    const grabber = document.body.querySelector<HTMLElement>("[data-sheet-grabber]");

    await act(async () => {
      grabber?.dispatchEvent(touch("touchstart", 300));
      grabber?.dispatchEvent(touch("touchmove", 200));
      grabber?.dispatchEvent(touch("touchend", 200));
    });

    expect(onDismiss).not.toHaveBeenCalled();
  });
});

describe("editing (D78)", () => {
  it("reports a value the moment it changes", async () => {
    const onSet = vi.fn();
    await render({ onSet });

    const good = document.body.querySelector<HTMLButtonElement>('button[aria-label="Mood: good"]');
    await act(async () => good?.click());

    expect(onSet).toHaveBeenCalledWith("mood", "good");
  });

  it("closes on Done without committing anything of its own", async () => {
    const onSet = vi.fn();
    const onDismiss = vi.fn();
    await render({ onSet, onDismiss });

    const done = document.body.querySelector<HTMLButtonElement>('button[aria-label="Done"]');
    await act(async () => done?.click());

    expect(onDismiss).toHaveBeenCalled();
    expect(onSet).not.toHaveBeenCalled();
  });

  it("keeps every control at the touch minimum", async () => {
    await render({ values: { mood: "good" } });

    for (const control of sheet().querySelectorAll("button, input")) {
      expect(control.className).toMatch(/min-h-11|h-11/);
    }
  });
});

describe("the soft keyboard (D78)", () => {
  it("rides above the keyboard rather than behind it", async () => {
    // The visual viewport shrinks by the keyboard's height; the sheet sits on
    // top of what is left.
    withViewport(560, 0);
    await render();

    expect(sheet().style.bottom).toBe("240px");
  });

  it("sits on the bottom edge when no keyboard is up", async () => {
    withViewport(800, 0);
    await render();

    expect(sheet().style.bottom).toBe("0px");
  });
});

// --- helpers ---------------------------------------------------------------

function touch(type: string, clientY: number): Event {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, "touches", {
    value: type === "touchend" ? [] : [{ clientY }]
  });
  Object.defineProperty(event, "changedTouches", { value: [{ clientY }] });
  return event;
}

function withViewport(height: number, offsetTop: number): void {
  Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: {
      height,
      offsetTop,
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    }
  });
}
