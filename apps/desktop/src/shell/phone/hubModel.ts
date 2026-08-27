import type { DesktopCommandId } from "../../commands/commandRegistry";
import type { DesktopPanelId } from "../../panels/panelRegistryModel";

/**
 * One slot in the phone's bottom hub.
 *
 * A `side: "bottom"` panel contribution was rejected: `side` says where a panel
 * lives and renders, while the hub holds *pointers* to panels that live left or
 * right. Making the assistant bottom-sided would remove it from the top-right
 * action-items menu. Keeping the hub a list of targets means the panel registry,
 * `Popout`, and the side-narrowed contribution union are all untouched, and
 * extensions become hub-reachable with no extension-API change.
 */
export type HubItem =
  | { readonly kind: "panel"; readonly id: DesktopPanelId }
  | { readonly kind: "command"; readonly id: DesktopCommandId }
  | { readonly kind: "menu" };

/** A hub item with its presentation resolved from the live registries. */
export interface ResolvedHubItem {
  /**
   * Stable within one resolve, unique across slots — usable as a React key.
   * Index-prefixed because the same target may be pinned twice; keying by
   * target id alone would collide and drop a slot from the rendered bar.
   */
  readonly key: string;
  readonly kind: HubItem["kind"];
  readonly label: string;
  readonly icon: string;
  readonly badge?: number;
  /** Only ever true for panel items — a command fires and returns. */
  readonly active: boolean;
  readonly target: HubItem;
}

/** Minimal shapes the resolver needs; keeps it testable without the registries. */
interface HubPanel {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly side: "left" | "right";
}
interface HubCommand {
  readonly id: string;
  readonly title: string;
  readonly icon?: string;
}

export interface HubContext {
  readonly panels: readonly HubPanel[];
  readonly commands: readonly HubCommand[];
  readonly activeLeftPanel: string | null;
  readonly activeRightPanel: string | null;
  readonly badges: Readonly<Record<string, number>>;
}

/**
 * The out-of-the-box hub.
 *
 * Files and Search are left panels, the assistant is a right panel, and the hub
 * does not care which — activating either is a reveal. There is no "Home": the
 * first slot is a shortcut whose label comes from its target's registration.
 */
export const DEFAULT_HUB_ITEMS: readonly HubItem[] = [
  { kind: "panel", id: "explorer" },
  { kind: "panel", id: "search" },
  { kind: "command", id: "new-note" },
  { kind: "panel", id: "assistant" },
  { kind: "menu" }
];

/** Icon identifier for the drawer slot; resolved through `panelIcons` like any other. */
const MENU_ICON = "menu";

export function resolveHubItems(
  items: readonly HubItem[],
  context: HubContext
): readonly ResolvedHubItem[] {
  const resolved: ResolvedHubItem[] = [];

  for (const [index, item] of items.entries()) {
    if (item.kind === "menu") {
      resolved.push({
        key: `menu-${index}`,
        kind: "menu",
        label: "Menu",
        icon: MENU_ICON,
        active: false,
        target: item
      });
      continue;
    }

    if (item.kind === "panel") {
      const panel = context.panels.find((candidate) => candidate.id === item.id);
      // An unregistered id is skipped, never repaired: an extension that is
      // merely deactivated must not silently lose its pin.
      if (!panel) continue;
      const activeId = panel.side === "left" ? context.activeLeftPanel : context.activeRightPanel;
      resolved.push({
        key: `panel-${index}-${panel.id}`,
        kind: "panel",
        label: panel.label,
        icon: panel.icon,
        badge: context.badges[panel.id],
        active: activeId === panel.id,
        target: item
      });
      continue;
    }

    const command = context.commands.find((candidate) => candidate.id === item.id);
    // A command with no icon has nothing to draw in a five-slot bar.
    if (!command?.icon) continue;
    resolved.push({
      key: `command-${index}-${command.id}`,
      kind: "command",
      label: command.title,
      icon: command.icon,
      active: false,
      target: item
    });
  }

  return resolved;
}

/** Narrows one parsed entry, dropping anything that is not a well-formed item. */
const asHubItem = (value: unknown): HubItem | null => {
  if (typeof value !== "object" || value === null) return null;
  const entry = value as { kind?: unknown; id?: unknown };
  if (entry.kind === "menu") return { kind: "menu" };
  if (typeof entry.id !== "string" || entry.id.length === 0) return null;
  if (entry.kind === "panel") return { kind: "panel", id: entry.id };
  if (entry.kind === "command") return { kind: "command", id: entry.id };
  return null;
};

/**
 * Reads the persisted hub.
 *
 * Falls back to the defaults rather than throwing: a corrupt preference must
 * not cost the user their only means of navigating the app. The same reasoning
 * covers a list that parses to nothing usable — an empty bar is unnavigable, so
 * `[]` is treated as "unset" rather than round-tripped.
 *
 * Ids are *not* validated against the registries here. Whether a target exists
 * is a render-time question (see `resolveHubItems`); resolving it at load would
 * quietly delete an inactive extension's pin the next time the hub was saved.
 */
export function parseHubItems(raw: string): readonly HubItem[] {
  if (raw.trim().length === 0) return DEFAULT_HUB_ITEMS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_HUB_ITEMS;
    const items = parsed.map(asHubItem).filter((item): item is HubItem => item !== null);
    return items.length > 0 ? items : DEFAULT_HUB_ITEMS;
  } catch {
    return DEFAULT_HUB_ITEMS;
  }
}

export function serializeHubItems(items: readonly HubItem[]): string {
  return JSON.stringify(items);
}
