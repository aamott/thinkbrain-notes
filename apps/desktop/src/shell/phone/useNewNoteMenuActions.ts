import { useMemo } from "react";

import { useDesktopCommands, type DesktopCommandId } from "../../commands/commandRegistry";
import { useMobileNewNoteActions } from "../../commands/mobileNewNoteActionRegistry";
import type { NewNoteMenuAction } from "./NewNoteMenu";

/** What the New-note popup needs: resolved rows plus id→command lookup. */
export interface NewNoteMenuActions {
  readonly actions: readonly NewNoteMenuAction[];
  /** The canonical command a contributed row points at, or undefined. */
  readonly commandIdFor: (actionId: string) => DesktopCommandId | undefined;
}

/**
 * Resolves the New-note popup's contributed rows against the command registry.
 *
 * Contributed rows stay listed even when their command is missing — a
 * vanishing row is more confusing than a greyed one. Disabled when the
 * command is absent, declared unavailable, or gated on a workspace that is
 * not loaded.
 */
export function useNewNoteMenuActions(workspaceAvailable: boolean): NewNoteMenuActions {
  const commands = useDesktopCommands();
  const newNoteActions = useMobileNewNoteActions();

  const actions = useMemo<readonly NewNoteMenuAction[]>(
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
            (action.requiresWorkspace === true && !workspaceAvailable)
        };
      }),
    [newNoteActions, commands, workspaceAvailable]
  );

  return {
    actions,
    commandIdFor: (actionId) =>
      newNoteActions.find((action) => action.id === actionId)?.commandId
  };
}
