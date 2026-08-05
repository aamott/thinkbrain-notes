import type { Extension } from "@codemirror/state";
import type { KeyBinding } from "@codemirror/view";
import { describe, expect, it } from "vitest";

import {
  createDesktopEditorHookRegistry,
  type DesktopEditorHookContribution
} from "./editorHookRegistry";

interface TestPayload {
  readonly label: string;
}

function binding(key: string): KeyBinding {
  return { key, run: () => true };
}

function extension(id: string): Extension {
  return { id } as unknown as Extension;
}

function contribution(
  id: string,
  order: number
): DesktopEditorHookContribution<TestPayload, undefined> {
  return {
    id,
    order,
    keybindings: (payload) => [binding(`${payload.label}-${id}`)]
  };
}

function extensionContribution(
  id: string,
  order: number
): DesktopEditorHookContribution<TestPayload, undefined> {
  return {
    id,
    order,
    extensions: (payload) => [extension(`${payload.label}-${id}`)]
  };
}

describe("desktop editor hook registry", () => {
  it("looks up contributions and preserves registration order", () => {
    const first = contribution("first", 20);
    const second = contribution("second", 10);
    const registry = createDesktopEditorHookRegistry<TestPayload, undefined>([first, second]);

    expect(registry.get("first")).toBe(first);
    expect(registry.get("missing")).toBeUndefined();
    expect(registry.entries()).toEqual([first, second]);
  });

  it("assembles hooks by order and retains registration order for ties", () => {
    const registry = createDesktopEditorHookRegistry<TestPayload, undefined>([
      contribution("late", 20),
      contribution("tie-a", 10),
      contribution("tie-b", 10),
      contribution("early", 0)
    ]);

    expect(registry.orderedEntries().map(({ id }) => id)).toEqual([
      "early",
      "tie-a",
      "tie-b",
      "late"
    ]);
    expect(registry.getKeybindings({ label: "hook" }, undefined).map(({ key }) => key)).toEqual([
      "hook-early",
      "hook-tie-a",
      "hook-tie-b",
      "hook-late"
    ]);
  });

  it("assembles extensions from an extensions-only contribution and no keybindings", () => {
    const extOnly = extensionContribution("ext-only", 10);
    const registry = createDesktopEditorHookRegistry<TestPayload, undefined>([extOnly]);

    expect(registry.getExtensions({ label: "hook" }, undefined)).toEqual([
      extension("hook-ext-only")
    ]);
    expect(registry.getKeybindings({ label: "hook" }, undefined)).toEqual([]);
  });

  it("assembles keybindings from a keybindings-only contribution and no extensions", () => {
    const keyOnly = contribution("key-only", 20);
    const registry = createDesktopEditorHookRegistry<TestPayload, undefined>([keyOnly]);

    expect(
      registry
        .getKeybindings({ label: "hook" }, undefined)
        .map((entry) => entry.key)
    ).toEqual(["hook-key-only"]);
    expect(registry.getExtensions({ label: "hook" }, undefined)).toEqual([]);
  });

  it("assembles extensions by order and retains registration order for ties", () => {
    const registry = createDesktopEditorHookRegistry<TestPayload, undefined>([
      extensionContribution("late", 20),
      extensionContribution("tie-a", 10),
      extensionContribution("tie-b", 10),
      extensionContribution("early", 0)
    ]);

    expect(registry.getExtensions({ label: "hook" }, undefined)).toEqual([
      extension("hook-early"),
      extension("hook-tie-a"),
      extension("hook-tie-b"),
      extension("hook-late")
    ]);
  });

  it("fails loudly when an identifier is registered twice", () => {
    const first = contribution("duplicate", 0);
    const registry = createDesktopEditorHookRegistry<TestPayload, undefined>([first]);

    expect(() => registry.register(contribution("duplicate", 1))).toThrow(
      'already registered for id "duplicate"'
    );
    expect(() =>
      createDesktopEditorHookRegistry<TestPayload, undefined>([first, contribution("duplicate", 1)])
    ).toThrow('already registered for id "duplicate"');
  });
});
