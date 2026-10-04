import { FileClock, Plus } from "lucide-react";

import { useDismissable } from "@thinkbrain/ui";

import { PanelIcon } from "../panelIcons";
import { PhoneMenuRow } from "./PhoneMenuRow";
import { handlePhoneMenuKeyDown } from "./phoneMenuKeyboard";
import { PHONE_OVERLAY_BOUNDS } from "./overlayBounds";
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
 * Compact popup the hub's New note slot opens: create, extension-contributed
 * actions, or jump back to the most recent note. It is an anchored menu — not
 * a sheet — because a short pick list wants the lightest surface that can
 * carry a history entry.
 *
 * Rendered inside `PhoneHub`'s relative wrapper, it hangs directly above the
 * bar and follows the slot's rendered position via `anchorPercent`, clamped so
 * an edge slot cannot push the menu off-screen.
 */
export function NewNoteMenu({
  open,
  anchorPercent,
  recentNote,
  actions,
  onCreate,
  onOpenRecent,
  onSelectAction,
  onDismiss
}: {
  readonly open: boolean;
  /** Percentage of the bar width where the New note slot's center sits. */
  readonly anchorPercent: number;
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
      <div
        aria-hidden="true"
        className={cn("fixed inset-x-0 z-30", PHONE_OVERLAY_BOUNDS)}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) onDismiss();
        }}
      />
      <div
        ref={containerRef}
        role="menu"
        aria-label="New note actions"
        onKeyDown={handlePhoneMenuKeyDown}
        style={{
          left: `clamp(7rem, ${anchorPercent}%, calc(100% - 7rem))`
        }}
        className="absolute bottom-[calc(100%+0.5rem)] z-50 w-56 -translate-x-1/2 rounded-medium border border-border bg-surface p-1 text-foreground shadow-panel"
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
