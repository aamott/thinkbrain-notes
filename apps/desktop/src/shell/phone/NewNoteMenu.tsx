import { FileClock, Plus } from "lucide-react";

import { PanelIcon } from "../panelIcons";
import { PhoneMenuRow } from "./PhoneMenuRow";
import { BubbleMenuShell } from "./BubbleMenuShell";

interface RecentNoteAction {
  readonly title: string;
}

/** A contributed New-note row: a resolved pointer to a canonical command. */
export interface NewNoteMenuAction {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly disabled: boolean;
}

/**
 * Compact popup the New-note bubble opens: create, extension-contributed
 * actions, or jump back to the most recent note. It is an anchored menu — not
 * a sheet — because a short pick list wants the lightest surface that can
 * carry a history entry.
 *
 * Rendered at the PhoneShell level, it hangs just above the left bubble
 * group. `BubbleMenuShell` owns the dismiss layer, Escape and roving focus;
 * this file is only the rows.
 */
export function NewNoteMenu({
  open,
  recentNote,
  actions,
  onCreate,
  onOpenRecent,
  onSelectAction,
  onDismiss
}: {
  readonly open: boolean;
  readonly recentNote: RecentNoteAction | null;
  /** Extension-contributed rows, rendered in registry order. */
  readonly actions: readonly NewNoteMenuAction[];
  readonly onCreate: () => void;
  readonly onOpenRecent: () => void;
  readonly onSelectAction: (id: string) => void;
  readonly onDismiss: () => void;
}) {
  return (
    <BubbleMenuShell
      name="new-note"
      label="New note actions"
      open={open}
      menuClassName="left-3 w-56 p-1"
      onDismiss={onDismiss}
    >
      <PhoneMenuRow
        icon={<Plus aria-hidden="true" />}
        label="Create new note"
        onSelect={onCreate}
      />
      {actions.map((action) => (
        <PhoneMenuRow
          key={action.id}
          icon={<PanelIcon name={action.icon} />}
          label={action.label}
          disabled={action.disabled}
          onSelect={() => onSelectAction(action.id)}
        />
      ))}
      <PhoneMenuRow
        icon={<FileClock aria-hidden="true" />}
        label="Open most recent note"
        detail={recentNote?.title}
        disabled={recentNote === null}
        onSelect={onOpenRecent}
      />
    </BubbleMenuShell>
  );
}
