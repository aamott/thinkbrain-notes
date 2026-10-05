import { FileClock, Plus } from "lucide-react";

import { useDismissable } from "@thinkbrain/ui";

import { PanelIcon } from "../panelIcons";
import { PhoneMenuRow } from "./PhoneMenuRow";
import { handlePhoneMenuKeyDown } from "./phoneMenuKeyboard";
import { PHONE_BUBBLE_MENU_BOTTOM } from "./overlayBounds";
import { cn } from "../../lib/utils";

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
 * group. Its outside-dismiss layer spans the whole shell — bubbles included —
 * so tapping the trigger bubble while the menu is open counts as outside:
 * the menu closes and the same tap does not reopen it.
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
  const { containerRef } = useDismissable({ open, onDismiss });
  if (!open) return null;

  return (
    <>
      {/* Whole shell including the bubbles: the layer sits above them (z-30
          over z-20) so a tap on the trigger bubble dismisses instead of
          retriggering. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-30"
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) onDismiss();
        }}
      />
      <div
        ref={containerRef}
        role="menu"
        aria-label="New note actions"
        onKeyDown={handlePhoneMenuKeyDown}
        className={cn(
          "absolute left-3 z-40 w-56 rounded-medium border border-border bg-surface p-1 text-foreground shadow-panel",
          PHONE_BUBBLE_MENU_BOTTOM
        )}
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
      </div>
    </>
  );
}
