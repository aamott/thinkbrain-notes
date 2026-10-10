// @vitest-environment happy-dom

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dismissTopOverlay } from "@thinkbrain/ui";
import { CommandPalette } from "./CommandPalette";
import type { DesktopCommand } from "./commandRegistry";

const availableCommand: DesktopCommand = {
  id: "open-settings",
  title: "Open settings",
  availability: "available",
  keybinding: "⌘,",
  handler: () => undefined
};

const unavailableCommand: DesktopCommand = {
  id: "unavailable",
  title: "Unavailable command",
  availability: "unavailable",
  unavailableMessage: "Unavailable for this workspace.",
  handler: () => undefined
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

async function renderPalette(options: Partial<ComponentProps<typeof CommandPalette>> = {}) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const onClose = vi.fn();
  const onCommand = vi.fn();
  const onOpenFile = vi.fn();

  await act(async () => {
    root?.render(
      <CommandPalette
        commands={[availableCommand, unavailableCommand]}
        files={[{ rootPath: "/notes", relativePath: "draft.md" }]}
        onClose={onClose}
        onCommand={onCommand}
        onOpenFile={onOpenFile}
        {...options}
      />
    );
  });

  return {
    input: document.querySelector<HTMLInputElement>("[role='dialog'] input")!,
    onClose,
    onCommand,
    onOpenFile
  };
}

async function keyDown(element: Element, key: string, shiftKey = false) {
  await act(async () => {
    element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, shiftKey }));
  });
}

async function changeInput(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("CommandPalette", () => {
  it("uses the combobox pattern and visually marks unavailable options", async () => {
    const { input } = await renderPalette();

    expect(input.getAttribute("role")).toBe("combobox");
    expect(input.getAttribute("aria-expanded")).toBe("true");
    const unavailable = document.querySelector<HTMLButtonElement>("#command-unavailable");
    expect(unavailable?.tabIndex).toBe(-1);
    expect(unavailable?.dataset.unavailable).toBe("true");
    expect(unavailable?.getAttribute("aria-disabled")).toBeNull();
  });

  it("navigates commands, runs available commands, and reports unavailable commands", async () => {
    const { input, onClose, onCommand } = await renderPalette();

    expect(document.activeElement).toBe(input);
    expect(input.getAttribute("aria-activedescendant")).toBe("command-open-settings");
    await keyDown(input, "ArrowDown");
    expect(input.getAttribute("aria-activedescendant")).toBe("command-unavailable");
    await keyDown(input, "Home");
    expect(input.getAttribute("aria-activedescendant")).toBe("command-open-settings");
    await keyDown(input, "End");
    expect(input.getAttribute("aria-activedescendant")).toBe("command-unavailable");
    await keyDown(input, "Enter");
    expect(onCommand).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector("[role='status']")?.textContent).toContain("Unavailable for this workspace.");

    await keyDown(input, "Home");
    await keyDown(input, "Enter");
    expect(onCommand).toHaveBeenCalledWith(availableCommand);
    await keyDown(input, "Escape");
    expect(onClose).toHaveBeenCalledWith();
  });

  it("filters workspace files, opens the selected file, traps Tab, and closes from the backdrop", async () => {
    const { input, onClose, onOpenFile } = await renderPalette();

    await changeInput(input, "draft");
    expect(document.querySelector("#file-draft\\.md")).not.toBeNull();
    await keyDown(input, "Enter");
    expect(onOpenFile).toHaveBeenCalledWith({ rootPath: "/notes", relativePath: "draft.md" });
    expect(onClose).toHaveBeenCalledWith(false);

    const dialog = document.querySelector<HTMLElement>("[role='dialog']");
    if (!dialog) throw new Error("Command palette dialog was not rendered.");
    expect(container?.contains(dialog)).toBe(false);
    await keyDown(dialog, "Tab");
    expect(document.activeElement).toBe(input);
    await act(async () => {
      document.querySelector<HTMLElement>("[role='presentation']")?.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true })
      );
    });
    expect(onClose).toHaveBeenCalledWith();
  });

  it("is dismissed by the Android-back overlay bridge", async () => {
    const { onClose } = await renderPalette();

    expect(dismissTopOverlay()).toBe(true);
    expect(onClose).toHaveBeenCalledWith();
  });
});
