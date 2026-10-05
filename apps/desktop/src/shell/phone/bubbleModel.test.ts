import { describe, expect, it } from "vitest";

import { resolveBubbles, type BubbleContext } from "./bubbleModel";

const ctx = (overrides: Partial<BubbleContext> = {}): BubbleContext => ({
  route: { kind: "files" },
  viewingNote: false,
  availableActionCount: 0,
  actionsBadge: 0,
  ...overrides
});

describe("resolveBubbles", () => {
  it("offers New note on the Files route", () => {
    expect(resolveBubbles(ctx()).left).toEqual(["new-note"]);
  });

  it("shows no Actions bubble when nothing is available", () => {
    expect(resolveBubbles(ctx()).right).toEqual([]);
  });

  it("keeps the Actions bubble for a badge with no available panels", () => {
    // A panel notification must be reachable even when every right panel is
    // unavailable in the current context.
    expect(resolveBubbles(ctx({ actionsBadge: 2 })).right).toEqual(["actions"]);
  });

  it("offers Home, New note and Actions while viewing a note", () => {
    const resolved = resolveBubbles(
      ctx({ route: { kind: "tab", tabId: "t" }, viewingNote: true, availableActionCount: 3 })
    );
    expect(resolved.left).toEqual(["home", "new-note"]);
    expect(resolved.right).toEqual(["actions"]);
  });

  it("offers only Home on a non-note tab", () => {
    // Code editors, media viewers, settings and the new-tab page are all
    // non-note tabs: New note is a note affordance, so it stays away.
    const resolved = resolveBubbles(
      ctx({ route: { kind: "tab", tabId: "t" }, viewingNote: false, availableActionCount: 1 })
    );
    expect(resolved.left).toEqual(["home"]);
  });

  it("offers Home on a panel route", () => {
    expect(
      resolveBubbles(ctx({ route: { kind: "panel", panel: "search" } })).left
    ).toEqual(["home"]);
  });
});
