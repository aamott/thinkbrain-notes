import { describe, expect, it } from "vitest";

import { isPinnedPanel, MAX_HUB_ITEMS, pinPanel, removeItem } from "./hubEditing";
import type { HubItem } from "./hubModel";

const base: readonly HubItem[] = [
  { kind: "panel", id: "explorer" },
  { kind: "command", id: "new-note" },
  { kind: "menu" }
];

describe("pinPanel", () => {
  it("inserts before the menu, which stays last", () => {
    const next = pinPanel(base, "search");

    expect(next).toEqual([
      { kind: "panel", id: "explorer" },
      { kind: "command", id: "new-note" },
      { kind: "panel", id: "search" },
      { kind: "menu" }
    ]);
  });

  it("is a no-op for a panel already pinned", () => {
    expect(pinPanel(base, "explorer")).toEqual(base);
  });

  it("refuses to exceed the slot limit", () => {
    const full: readonly HubItem[] = [
      { kind: "panel", id: "explorer" },
      { kind: "panel", id: "search" },
      { kind: "panel", id: "conflicts" },
      { kind: "panel", id: "history" },
      { kind: "menu" }
    ];

    expect(pinPanel(full, "tags")).toEqual(full);
    expect(full).toHaveLength(MAX_HUB_ITEMS);
  });

  // Both refusals hand back the identical array, so a caller can tell "nothing
  // happened" from "something moved" without re-deriving the reason.
  it("returns the same array reference when it declines", () => {
    expect(pinPanel(base, "explorer")).toBe(base);
  });

  it("appends when a persisted hub has no menu slot", () => {
    const menuless: readonly HubItem[] = [{ kind: "panel", id: "explorer" }];

    expect(pinPanel(menuless, "search")).toEqual([
      { kind: "panel", id: "explorer" },
      { kind: "panel", id: "search" }
    ]);
  });

  // Two menus is only reachable by hand-editing the setting, but the insert
  // point must still be *before* the first one, or the shortcut lands past the
  // slot the user reads as the end of the bar.
  it("inserts before the first menu when a persisted hub holds two", () => {
    const doubled: readonly HubItem[] = [{ kind: "menu" }, { kind: "menu" }];

    expect(pinPanel(doubled, "search")).toEqual([
      { kind: "panel", id: "search" },
      { kind: "menu" },
      { kind: "menu" }
    ]);
  });
});

describe("removeItem", () => {
  it("removes a matching panel", () => {
    expect(removeItem(base, { kind: "panel", id: "explorer" })).toEqual([
      { kind: "command", id: "new-note" },
      { kind: "menu" }
    ]);
  });

  it("never removes the menu", () => {
    expect(removeItem(base, { kind: "menu" })).toEqual(base);
  });

  it("keeps every menu when a persisted hub holds two", () => {
    const doubled: readonly HubItem[] = [
      { kind: "menu" },
      { kind: "panel", id: "search" },
      { kind: "menu" }
    ];

    expect(removeItem(doubled, { kind: "menu" })).toBe(doubled);
    expect(removeItem(doubled, { kind: "panel", id: "search" })).toEqual([
      { kind: "menu" },
      { kind: "menu" }
    ]);
  });

  it("leaves a command of the same id alone when a panel is removed", () => {
    const mixed: readonly HubItem[] = [
      { kind: "panel", id: "search" },
      { kind: "command", id: "search" },
      { kind: "menu" }
    ];

    expect(removeItem(mixed, { kind: "panel", id: "search" })).toEqual([
      { kind: "command", id: "search" },
      { kind: "menu" }
    ]);
  });

  // `parseHubItems` reads `[]` back as "unset" and answers with the defaults,
  // so persisting an empty hub would resurrect five shortcuts the user had just
  // cleared. A menu-only bar is the honest floor.
  it("falls back to a menu-only hub rather than an unpersistable empty one", () => {
    const single: readonly HubItem[] = [{ kind: "panel", id: "explorer" }];

    expect(removeItem(single, { kind: "panel", id: "explorer" })).toEqual([{ kind: "menu" }]);
  });
});

describe("isPinnedPanel", () => {
  it("answers for panel targets only", () => {
    expect(isPinnedPanel(base, "explorer")).toBe(true);
    expect(isPinnedPanel(base, "search")).toBe(false);
    // A command slot sharing an id is not a panel pin.
    expect(isPinnedPanel(base, "new-note")).toBe(false);
  });
});
