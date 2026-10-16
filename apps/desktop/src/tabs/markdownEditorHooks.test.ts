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
  wikiLinkAutocompleteCompartment: new Compartment(),
  linkOptions: {},
  ...overrides
});

describe("markdownEditorHookRegistry", () => {
  it("registers the expected built-in hook ids", () => {
    expect(markdownEditorHookRegistry.entries().map(({ id }) => id)).toEqual([
      "history",
      "markdown-language",
      "markdown-live-preview",
      "wiki-link-autocomplete",
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

  it("still assembles extensions in source mode", () => {
    // The hook contributes a compartment-mounted extension rather than
    // dropping out, so it can be reconfigured on later without remounting.
    expect(
      markdownEditorHookRegistry.getExtensions(
        payload({ linkOptions: { sourceMode: true } }),
        undefined
      ).length
    ).toBeGreaterThan(0);
  });
});
