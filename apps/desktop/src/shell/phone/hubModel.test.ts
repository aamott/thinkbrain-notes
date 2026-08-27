import { describe, expect, it } from "vitest";

import {
  DEFAULT_HUB_ITEMS,
  parseHubItems,
  resolveHubItems,
  serializeHubItems,
  type HubItem
} from "./hubModel";

const panels = [
  { id: "explorer", label: "Files", icon: "files", side: "left" as const },
  { id: "assistant", label: "Assistant", icon: "assistant", side: "right" as const }
];
const commands = [{ id: "new-note", title: "New note", icon: "plus" }];

const context = {
  panels,
  commands,
  activeLeftPanel: "explorer" as string | null,
  activeRightPanel: null as string | null,
  badges: { explorer: 2 }
};

describe("resolveHubItems", () => {
  it("takes a panel item's label, icon, badge and active state from the registry", () => {
    const [resolved] = resolveHubItems([{ kind: "panel", id: "explorer" }], context);

    expect(resolved).toMatchObject({
      kind: "panel",
      label: "Files",
      icon: "files",
      badge: 2,
      active: true
    });
  });

  it("takes a command item's label and icon from the command, and is never active", () => {
    const [resolved] = resolveHubItems([{ kind: "command", id: "new-note" }], context);

    expect(resolved).toMatchObject({
      kind: "command",
      label: "New note",
      icon: "plus",
      active: false
    });
  });

  it("always resolves the menu item", () => {
    const [resolved] = resolveHubItems([{ kind: "menu" }], context);

    expect(resolved).toMatchObject({ kind: "menu", label: "Menu", active: false });
  });

  it("skips a panel whose extension is not registered, keeping the pin's neighbours", () => {
    const items: readonly HubItem[] = [
      { kind: "panel", id: "journal-calendar.journal" },
      { kind: "menu" }
    ];

    const resolved = resolveHubItems(items, context);

    expect(resolved.map((entry) => entry.kind)).toEqual(["menu"]);
  });

  it("skips a command with no icon, because the hub has nothing to draw", () => {
    const resolved = resolveHubItems([{ kind: "command", id: "open-file" }], {
      ...context,
      commands: [{ id: "open-file", title: "Open file" }]
    });

    expect(resolved).toEqual([]);
  });

  it("skips a command nobody registered", () => {
    const resolved = resolveHubItems([{ kind: "command", id: "gone.command" }], context);

    expect(resolved).toEqual([]);
  });

  it("marks a right-side panel active from the right panel selection", () => {
    const [resolved] = resolveHubItems([{ kind: "panel", id: "assistant" }], {
      ...context,
      activeRightPanel: "assistant"
    });

    expect(resolved?.active).toBe(true);
  });

  it("does not mark a right-side panel active from the left panel selection", () => {
    const [resolved] = resolveHubItems([{ kind: "panel", id: "assistant" }], {
      ...context,
      activeLeftPanel: "assistant"
    });

    expect(resolved?.active).toBe(false);
  });

  it("leaves the badge undefined when the panel has none", () => {
    const [resolved] = resolveHubItems([{ kind: "panel", id: "assistant" }], context);

    expect(resolved?.badge).toBeUndefined();
  });

  it("gives every slot a distinct key, so duplicate pins can both render", () => {
    const items: readonly HubItem[] = [
      { kind: "panel", id: "explorer" },
      { kind: "panel", id: "explorer" },
      { kind: "menu" },
      { kind: "menu" }
    ];

    const keys = resolveHubItems(items, context).map((entry) => entry.key);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it("hands back the original item as the target, so callers can dispatch on it", () => {
    const item: HubItem = { kind: "panel", id: "explorer" };

    expect(resolveHubItems([item], context)[0]?.target).toEqual(item);
  });

  it("resolves nothing from an empty list rather than inventing defaults", () => {
    expect(resolveHubItems([], context)).toEqual([]);
  });

  it("resolves what the defaults point at when the registries are empty", () => {
    const resolved = resolveHubItems(DEFAULT_HUB_ITEMS, {
      panels: [],
      commands: [],
      activeLeftPanel: null,
      activeRightPanel: null,
      badges: {}
    });

    expect(resolved.map((entry) => entry.kind)).toEqual(["menu"]);
  });
});

describe("parseHubItems", () => {
  it("falls back to the defaults for an empty setting", () => {
    expect(parseHubItems("")).toEqual(DEFAULT_HUB_ITEMS);
  });

  it("falls back to the defaults for whitespace", () => {
    expect(parseHubItems("   \n ")).toEqual(DEFAULT_HUB_ITEMS);
  });

  it("falls back to the defaults for malformed JSON rather than throwing", () => {
    expect(parseHubItems("{ not json")).toEqual(DEFAULT_HUB_ITEMS);
  });

  it("drops entries with an unknown kind", () => {
    expect(parseHubItems('[{"kind":"panel","id":"explorer"},{"kind":"nope"}]')).toEqual([
      { kind: "panel", id: "explorer" }
    ]);
  });

  it("never throws, whatever the settings store holds", () => {
    const hostile = [
      "",
      "   ",
      "null",
      "true",
      "42",
      '"a string"',
      "{}",
      '{"kind":"menu"}',
      "[",
      "[1,2,3]",
      '["explorer"]',
      "[null]",
      "[[]]",
      '[{"kind":"panel"}]',
      '[{"kind":"panel","id":""}]',
      '[{"kind":"panel","id":7}]',
      '[{"kind":"command","id":null}]',
      '[{"id":"explorer"}]',
      '[{"kind":42,"id":"explorer"}]'
    ];

    for (const raw of hostile) {
      expect(() => parseHubItems(raw)).not.toThrow();
      expect(Array.isArray(parseHubItems(raw))).toBe(true);
    }
  });

  it("falls back to the defaults for valid JSON of the wrong shape", () => {
    expect(parseHubItems('{"kind":"menu"}')).toEqual(DEFAULT_HUB_ITEMS);
    expect(parseHubItems("null")).toEqual(DEFAULT_HUB_ITEMS);
    expect(parseHubItems("42")).toEqual(DEFAULT_HUB_ITEMS);
    expect(parseHubItems('["explorer","search"]')).toEqual(DEFAULT_HUB_ITEMS);
  });

  it("strips unknown fields, so a resolved item never carries stowaway data", () => {
    expect(parseHubItems('[{"kind":"menu","id":"x","label":"Mine"}]')).toEqual([{ kind: "menu" }]);
    expect(parseHubItems('[{"kind":"panel","id":"explorer","icon":"skull"}]')).toEqual([
      { kind: "panel", id: "explorer" }
    ]);
  });

  it("keeps a pin whose target is not currently registered, so a deactivated extension does not lose it", () => {
    const raw = '[{"kind":"panel","id":"journal-calendar.journal"},{"kind":"menu"}]';

    const items = parseHubItems(raw);

    expect(items).toEqual([{ kind: "panel", id: "journal-calendar.journal" }, { kind: "menu" }]);
    expect(resolveHubItems(items, context).map((entry) => entry.kind)).toEqual(["menu"]);
  });

  it("round-trips through serializeHubItems", () => {
    expect(parseHubItems(serializeHubItems(DEFAULT_HUB_ITEMS))).toEqual(DEFAULT_HUB_ITEMS);
  });

  it("round-trips an arbitrary hub, including ids nothing has registered", () => {
    const items: readonly HubItem[] = [
      { kind: "command", id: "search" },
      { kind: "panel", id: "journal-calendar.journal" },
      { kind: "panel", id: "assistant" },
      { kind: "menu" }
    ];

    expect(parseHubItems(serializeHubItems(items))).toEqual(items);
  });

  it("is idempotent: re-serializing a parsed hub yields the same string", () => {
    const raw = serializeHubItems([{ kind: "panel", id: "explorer" }, { kind: "menu" }]);

    expect(serializeHubItems(parseHubItems(raw))).toBe(raw);
  });

  it("falls back to the defaults when every entry is unusable, so the user keeps a way to navigate", () => {
    expect(parseHubItems("[]")).toEqual(DEFAULT_HUB_ITEMS);
    expect(parseHubItems('[{"kind":"nope"},null,7]')).toEqual(DEFAULT_HUB_ITEMS);
  });
});

describe("DEFAULT_HUB_ITEMS", () => {
  it("ends with the menu, which is not removable", () => {
    expect(DEFAULT_HUB_ITEMS.at(-1)).toEqual({ kind: "menu" });
  });

  it("is the spec's five slots in order", () => {
    expect(DEFAULT_HUB_ITEMS).toEqual([
      { kind: "panel", id: "explorer" },
      { kind: "panel", id: "search" },
      { kind: "command", id: "new-note" },
      { kind: "panel", id: "assistant" },
      { kind: "menu" }
    ]);
  });
});
