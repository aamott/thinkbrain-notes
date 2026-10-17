import type { DesktopTab } from "./tabModel";

export type TabCycleOrder = "tab order" | "last visited";

/** Null means there is no other tab to select. Missing selection starts at the matching end. */
export function nextCycledTabId(
  tabs: readonly Pick<DesktopTab, "id">[],
  activeTabId: string | null,
  mode: TabCycleOrder,
  direction: -1 | 1
): string | null {
  if (tabs.length < 2) return null;
  // MRU needs a separate activation ledger: location history restores old visits
  // without recording recency. Until then the setting explicitly falls back.
  switch (mode) {
    case "last visited":
    case "tab order": {
      const current = tabs.findIndex((tab) => tab.id === activeTabId);
      const index = current < 0 ? (direction === 1 ? 0 : tabs.length - 1)
        : (current + direction + tabs.length) % tabs.length;
      return tabs[index]!.id;
    }
  }
}
