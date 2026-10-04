/**
 * Action items — the right-panel toggles in the title bar.
 *
 * Each registered right panel gets a row in the ⋯ menu; the *pinned* ones
 * also keep a dedicated icon in the bar. Pinning is persisted as a JSON list
 * in `ui.pinnedActionItems` (a `string` setting, same shape as
 * `ui.mobileHub`): an empty string means "use the defaults", an empty list
 * is a real choice — the user unpinned everything.
 *
 * A panel with an undismissed notification is shown regardless of pinning —
 * a notification the user cannot see is a notification that might as well
 * not exist. It appears with its badge and leaves again when the entry is
 * dismissed, without mutating the pinned set.
 */

import type { RightPanelContribution } from "../panels/panelRegistryModel";

/** What a fresh install pins. Outline is the read-most panel; the rest earn their spot. */
export const DEFAULT_PINNED_ACTION_ITEMS: readonly string[] = ["outline"];

/**
 * Reads the `ui.pinnedActionItems` value into a set of panel ids.
 *
 * Three states, deliberately distinguished:
 * - blank or corrupt → the built-in default;
 * - a JSON list (even `[]`) → exactly those pins — an empty list is a real
 *   "unpin everything", not a fallback to default;
 * - anything else → the default, treating a non-list value as corrupt.
 */
export function parsePinnedActionItems(raw: unknown): ReadonlySet<string> {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    if (raw.trim().length === 0) return new Set(DEFAULT_PINNED_ACTION_ITEMS);
    try {
      parsed = JSON.parse(raw);
    } catch {
      return new Set(DEFAULT_PINNED_ACTION_ITEMS);
    }
  }
  if (!Array.isArray(parsed)) return new Set(DEFAULT_PINNED_ACTION_ITEMS);
  return new Set(parsed.filter((id): id is string => typeof id === "string"));
}

/** Writes a pinned set back as the setting value. */
export function serializePinnedActionItems(pinned: ReadonlySet<string>): string {
  return JSON.stringify([...pinned]);
}

/** The panels a right-panel id maps onto in the title bar. */
export interface ActionItems {
  /** Icons shown in the bar: pinned panels, plus any with a waiting notification. */
  readonly visible: readonly RightPanelContribution[];
  /** Everything else, listed in the ⋯ menu. */
  readonly overflow: readonly RightPanelContribution[];
}

/**
 * Splits the registered right panels into bar icons and ⋯-menu rows.
 *
 * Registry order is preserved in both lists — a pin moves a row between
 * sections, never within one. A pinned id with no registered panel (an
 * unloaded extension) stays in the set so the pin survives the extension's
 * next load.
 */
export function resolveActionItems(
  panels: readonly RightPanelContribution[],
  pinned: ReadonlySet<string>,
  notified: ReadonlySet<string>
): ActionItems {
  const visible: RightPanelContribution[] = [];
  const overflow: RightPanelContribution[] = [];
  for (const panel of panels) {
    if (pinned.has(panel.id) || notified.has(panel.id)) visible.push(panel);
    else overflow.push(panel);
  }
  return { visible, overflow };
}
