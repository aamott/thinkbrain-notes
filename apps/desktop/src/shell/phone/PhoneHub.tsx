import { BottomNav, type BottomNavItem } from "@thinkbrain/ui";
import { useMemo } from "react";

import { useDesktopCommands } from "../../commands/commandRegistry";
import {
  useLeftPanelContributions,
  useRightPanelContributions
} from "../../panels/panelRegistryModel";
import { PanelIcon } from "../panelIcons";
import { resolveHubItems, type HubItem } from "./hubModel";
import { useKeyboardInset } from "./useKeyboardInset";

/**
 * Turns the persisted hub shortcuts into rendered navigation items.
 *
 * Panel targets get their label, icon, badge and active state from the panel
 * registry; command targets get label and icon from the command registry. The
 * hub itself holds only pointers, so nothing here is a second nav model.
 */
export function PhoneHub({
  items,
  activeLeftPanel,
  activeRightPanel,
  badges,
  onSelectPanel,
  onRunCommand,
  onOpenMenu,
  onLongPress
}: {
  readonly items: readonly HubItem[];
  readonly activeLeftPanel: string | null;
  readonly activeRightPanel: string | null;
  readonly badges: Readonly<Record<string, number>>;
  readonly onSelectPanel: (panelId: string) => void;
  readonly onRunCommand: (commandId: string) => void;
  readonly onOpenMenu: () => void;
  readonly onLongPress?: (item: HubItem) => void;
}) {
  const keyboardInset = useKeyboardInset();
  const leftPanels = useLeftPanelContributions();
  const rightPanels = useRightPanelContributions();
  const commands = useDesktopCommands();

  const navItems = useMemo<readonly BottomNavItem[]>(() => {
    const resolved = resolveHubItems(items, {
      panels: [...leftPanels, ...rightPanels],
      commands,
      activeLeftPanel,
      activeRightPanel,
      badges
    });
    return resolved.map((entry) => ({
      key: entry.key,
      label: entry.label,
      icon: <PanelIcon name={entry.icon} className="size-5" />,
      active: entry.active,
      badge: entry.badge,
      // Commands are actions (New Note), not destinations — they get the
      // primary chip so they read as "do this" rather than "go here."
      variant: entry.target.kind === "command" ? "primary" : "default",
      onSelect: () => {
        if (entry.target.kind === "menu") onOpenMenu();
        else if (entry.target.kind === "panel") onSelectPanel(entry.target.id);
        else onRunCommand(entry.target.id);
      },
      onLongPress:
        onLongPress && entry.target.kind !== "menu"
          ? () => onLongPress(entry.target)
          : undefined
    }));
  }, [
    items,
    leftPanels,
    rightPanels,
    commands,
    activeLeftPanel,
    activeRightPanel,
    badges,
    onSelectPanel,
    onRunCommand,
    onOpenMenu,
    onLongPress
  ]);

  // A five-slot bar wedged between the keyboard and the line being typed is
  // worse than no bar: it eats the last rows of the note and none of its
  // targets are what the thumb is reaching for. Hidden entirely rather than
  // pushed up, so the editor keeps the space.
  if (keyboardInset > 0) return null;

  return <BottomNav label="Primary navigation" items={navItems} />;
}
