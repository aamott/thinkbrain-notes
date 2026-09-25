import { BottomNav, type BottomNavItem } from "@thinkbrain/ui";
import { useMemo } from "react";

import { useDesktopCommands } from "../../commands/commandRegistry";
import { useMobileNewNoteActions } from "../../commands/mobileNewNoteActionRegistry";
import {
  useLeftPanelContributions,
  useRightPanelContributions
} from "../../panels/panelRegistryModel";
import { PanelIcon } from "../panelIcons";
import { resolveHubItems, type HubItem } from "./hubModel";
import { NewNoteMenu, type NewNoteMenuAction } from "./NewNoteMenu";
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
  menuOpen,
  activeCommandId,
  newNoteMenu,
  onSelectPanel,
  onRunCommand,
  onOpenMenu,
  onLongPress
}: {
  readonly items: readonly HubItem[];
  readonly activeLeftPanel: string | null;
  readonly activeRightPanel: string | null;
  readonly badges: Readonly<Record<string, number>>;
  readonly menuOpen: boolean;
  readonly activeCommandId: string | null;
  readonly newNoteMenu: {
    readonly open: boolean;
    readonly recentNote: { readonly title: string } | null;
    /** Whether a workspace is loaded; gates `requiresWorkspace` actions. */
    readonly workspaceAvailable: boolean;
    readonly onCreate: () => void;
    readonly onOpenRecent: () => void;
    readonly onDismiss: () => void;
  };
  readonly onSelectPanel: (panelId: string) => void;
  readonly onRunCommand: (commandId: string) => void;
  readonly onOpenMenu: () => void;
  readonly onLongPress?: (item: HubItem) => void;
}) {
  const keyboardInset = useKeyboardInset();
  const leftPanels = useLeftPanelContributions();
  const rightPanels = useRightPanelContributions();
  const commands = useDesktopCommands();
  const newNoteActions = useMobileNewNoteActions();

  const resolved = useMemo(
    () =>
      resolveHubItems(items, {
        panels: [...leftPanels, ...rightPanels],
        commands,
        activeLeftPanel,
        activeRightPanel,
        badges
      }),
    [items, leftPanels, rightPanels, commands, activeLeftPanel, activeRightPanel, badges]
  );

  const navItems = useMemo<readonly BottomNavItem[]>(
    () =>
      resolved.map((entry) => ({
        key: entry.key,
        label: entry.label,
        icon: <PanelIcon name={entry.icon} className="size-5" />,
        // Panel actives come from the resolver; menu and command slots light
        // up while their overlay is the topmost surface.
        active:
          entry.target.kind === "menu"
            ? menuOpen
            : entry.target.kind === "command"
              ? entry.target.id === activeCommandId
              : entry.active,
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
      })),
    [resolved, menuOpen, activeCommandId, onSelectPanel, onRunCommand, onOpenMenu, onLongPress]
  );

  // The popup anchors to the New note slot's rendered position, so it stays
  // over its button even after hub customization or an invalid pinned target.
  const newNoteIndex = resolved.findIndex(
    (entry) => entry.target.kind === "command" && entry.target.id === "new-note"
  );
  const anchorPercent =
    newNoteIndex >= 0 && resolved.length > 0
      ? ((newNoteIndex + 0.5) / resolved.length) * 100
      : 50;

  // Contributed rows stay listed even when their command is missing — a
  // vanishing row is more confusing than a greyed one. Disabled when the
  // command is absent, declared unavailable, or gated on a workspace that is
  // not loaded.
  const resolvedActions = useMemo<readonly NewNoteMenuAction[]>(
    () =>
      newNoteActions.map((action) => {
        const command = commands.find((candidate) => candidate.id === action.commandId);
        return {
          id: action.id,
          label: action.label,
          icon: action.icon,
          disabled:
            !command ||
            command.availability === "unavailable" ||
            (action.requiresWorkspace === true && !newNoteMenu.workspaceAvailable)
        };
      }),
    [newNoteActions, commands, newNoteMenu.workspaceAvailable]
  );

  // A five-slot bar wedged between the keyboard and the line being typed is
  // worse than no bar: it eats the last rows of the note and none of its
  // targets are what the thumb is reaching for. Hidden entirely rather than
  // pushed up, so the editor keeps the space.
  if (keyboardInset > 0) return null;

  return (
    <div className="relative shrink-0">
      <NewNoteMenu
        open={newNoteMenu.open}
        anchorPercent={anchorPercent}
        recentNote={newNoteMenu.recentNote}
        actions={resolvedActions}
        onCreate={newNoteMenu.onCreate}
        onOpenRecent={newNoteMenu.onOpenRecent}
        onSelectAction={(id) => {
          // Actions are pointers to canonical commands; run through the same
          // path as every other hub command, never a bespoke execution.
          const commandId = newNoteActions.find((action) => action.id === id)?.commandId;
          if (commandId) onRunCommand(commandId);
        }}
        onDismiss={newNoteMenu.onDismiss}
      />
      <BottomNav label="Primary navigation" items={navItems} />
    </div>
  );
}
