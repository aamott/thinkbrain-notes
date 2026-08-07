import { Compartment } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import {
  markdownEditorHookRegistry,
  type MarkdownEditorHookPayload
} from "./markdownEditorHooks";

const payload = (
  overrides: Partial<MarkdownEditorHookPayload> = {}
): MarkdownEditorHookPayload => ({
  onChange: () => undefined,
  onSave: () => undefined,
  livePreviewCompartment: new Compartment(),
  livePreviewEnabled: true,
  ...overrides
});

describe("markdownEditorHookRegistry", () => {
  it("registers the expected built-in hook ids", () => {
    expect(markdownEditorHookRegistry.entries().map(({ id }) => id)).toEqual([
      "history",
      "markdown-language",
      "markdown-live-preview",
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
    expect(
      markdownEditorHookRegistry.getExtensions(payload(), undefined).length
    ).toBeGreaterThan(0);
  });

  it("assembles a non-empty set of keybindings", () => {
    expect(
      markdownEditorHookRegistry.getKeybindings(payload(), undefined).length
    ).toBeGreaterThan(0);
  });

  it("still assembles extensions when live preview is disabled", () => {
    // The hook contributes an empty compartment rather than dropping out, so
    // it can be reconfigured on later without remounting the view.
    expect(
      markdownEditorHookRegistry.getExtensions(
        payload({ livePreviewEnabled: false }),
        undefined
      ).length
    ).toBeGreaterThan(0);
  });
});
