import type { HubItem } from "./hubModel";

/**
 * Slots the hub can hold.
 *
 * Five is not arbitrary: below roughly 72px per slot a label stops fitting on a
 * narrow phone, and the hub's whole point is that its labels are visible.
 */
export const MAX_HUB_ITEMS = 5;

/** The floor a hub can be edited down to — the menu is the only way back. */
const MENU_ONLY: readonly HubItem[] = [{ kind: "menu" }];

const isSameTarget = (a: HubItem, b: HubItem): boolean =>
  a.kind === b.kind && (a.kind === "menu" || b.kind === "menu" || a.id === b.id);

/** Whether a panel already holds a hub slot. Drives the drawer's "Pinned" mark. */
export function isPinnedPanel(items: readonly HubItem[], panelId: string): boolean {
  return items.some((item) => item.kind === "panel" && item.id === panelId);
}

/**
 * Adds a panel shortcut before the menu slot, which always stays last.
 *
 * Declining returns the *same array*, so a caller can tell a no-op from an edit
 * by identity and skip a pointless settings write. Which of the two reasons
 * applied is answerable without a return code — `isPinnedPanel` and
 * `items.length >= MAX_HUB_ITEMS` — and the drawer states both before the
 * gesture rather than leaving a press that appeared to do nothing.
 */
export function pinPanel(items: readonly HubItem[], panelId: string): readonly HubItem[] {
  if (isPinnedPanel(items, panelId)) return items;
  if (items.length >= MAX_HUB_ITEMS) return items;
  const menuIndex = items.findIndex((item) => item.kind === "menu");
  const insertAt = menuIndex === -1 ? items.length : menuIndex;
  return [...items.slice(0, insertAt), { kind: "panel", id: panelId }, ...items.slice(insertAt)];
}

/**
 * Removes a shortcut. The menu is not removable — it is the only way back.
 *
 * Removing the last non-menu slot of a hand-edited, menu-less hub would leave
 * `[]`, which `parseHubItems` reads back as "unset" and answers with the five
 * defaults. Persisting a menu-only hub instead keeps the removal real.
 */
export function removeItem(items: readonly HubItem[], target: HubItem): readonly HubItem[] {
  if (target.kind === "menu") return items;
  const next = items.filter((item) => !isSameTarget(item, target));
  if (next.length === items.length) return items;
  return next.length > 0 ? next : MENU_ONLY;
}
