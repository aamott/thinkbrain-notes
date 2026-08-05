import { describe, expect, it } from "vitest";

import { markdownEditorHookRegistry } from "./markdownEditorHooks";

describe("markdownEditorHookRegistry", () => {
  it("registers the expected built-in hook ids", () => {
    expect(markdownEditorHookRegistry.entries().map(({ id }) => id)).toEqual([
      "history",
      "markdown-language",
      "line-wrapping",
      "cursor-theme",
      "aria-content-attributes",
      "default-keybindings",
      "history-keybindings",
      "tab-keybinding",
      "save-keybinding",
      "update-listener"
    ]);
  });

  it("assembles a non-empty set of extensions", () => {
    const payload = {
      onChange: () => undefined,
      onSave: () => undefined
    };
    expect(markdownEditorHookRegistry.getExtensions(payload, undefined).length).toBeGreaterThan(0);
  });

  it("assembles a non-empty set of keybindings", () => {
    const payload = {
      onChange: () => undefined,
      onSave: () => undefined
    };
    expect(
      markdownEditorHookRegistry.getKeybindings(payload, undefined).length
    ).toBeGreaterThan(0);
  });
});
