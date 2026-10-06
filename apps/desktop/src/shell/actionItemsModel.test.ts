import { describe, expect, it } from "vitest";

import type { RightPanelContribution } from "../panels/panelRegistryModel";
import {
  DEFAULT_PINNED_ACTION_ITEMS,
  parsePinnedActionItems,
  resolveActionItems,
  serializePinnedActionItems
} from "./actionItemsModel";

const panel = (id: string): RightPanelContribution =>
  ({ id, label: id, icon: id, side: "right" }) as RightPanelContribution;

describe("parsePinnedActionItems", () => {
  it("falls back to the built-in default when the setting is blank or corrupt", () => {
    for (const raw of [undefined, "", "  ", "not json", "{}", "42"]) {
      expect([...parsePinnedActionItems(raw)], JSON.stringify(raw)).toEqual([
        ...DEFAULT_PINNED_ACTION_ITEMS
      ]);
    }
  });

  it("honours an explicit empty list — 'unpin everything' is a real choice", () => {
    expect(parsePinnedActionItems("[]").size).toBe(0);
  });

  it("keeps only string entries", () => {
    expect([...parsePinnedActionItems('["outline", 7, null, "history"]')]).toEqual([
      "outline",
      "history"
    ]);
  });
});

describe("resolveActionItems", () => {
  const panels = [panel("history"), panel("outline"), panel("backlinks"), panel("assistant")];

  it("splits pinned from overflow while keeping registry order", () => {
    const { visible, overflow } = resolveActionItems(
      panels,
      new Set(["outline", "assistant"]),
      new Set()
    );

    expect(visible.map((p) => p.id)).toEqual(["outline", "assistant"]);
    expect(overflow.map((p) => p.id)).toEqual(["history", "backlinks"]);
  });

  it("surfaces a notified panel unpinned, without touching the pinned set", () => {
    const { visible, overflow } = resolveActionItems(
      panels,
      new Set(["outline"]),
      new Set(["backlinks"])
    );

    expect(visible.map((p) => p.id)).toEqual(["outline", "backlinks"]);
    expect(overflow.map((p) => p.id)).toEqual(["history", "assistant"]);
  });

  it("ignores pinned ids with no registered panel", () => {
    const { visible } = resolveActionItems(panels, new Set(["outline", "gone.extension"]), new Set());

    expect(visible.map((p) => p.id)).toEqual(["outline"]);
  });
});

describe("serializePinnedActionItems", () => {
  it("round-trips through the parser", () => {
    const pinned = new Set(["outline", "history"]);
    expect(parsePinnedActionItems(serializePinnedActionItems(pinned))).toEqual(pinned);
  });
});
