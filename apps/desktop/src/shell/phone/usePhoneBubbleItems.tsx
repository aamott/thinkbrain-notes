import { EllipsisVertical, House, Plus } from "lucide-react";
import { useMemo } from "react";

import type { ResolvedBubbles } from "./bubbleModel";
import type { PhoneNavigation } from "./usePhoneNavigation";

interface UsePhoneBubbleItemsParams {
  readonly bubbleLayout: ResolvedBubbles;
  readonly conflictCount: number;
  readonly newNoteOpen: boolean;
  readonly actionsOpen: boolean;
  readonly actionsBadge: number;
  readonly navigation: PhoneNavigation;
}

/** The floating bubbles' items, placed on the sides `bubbleLayout` resolved. */
export function usePhoneBubbleItems({
  bubbleLayout,
  conflictCount,
  newNoteOpen,
  actionsOpen,
  actionsBadge,
  navigation
}: UsePhoneBubbleItemsParams) {
  return useMemo(() => {
    const byId = {
      home: {
        key: "home",
        label: "Home",
        icon: <House aria-hidden="true" className="size-5" />,
        badge: conflictCount > 0 ? conflictCount : undefined,
        badgeLabel: "conflicts",
        // Push, not toggle: Back returns to the note the user came from.
        onSelect: () => navigation.push({ kind: "files" })
      },
      "new-note": {
        key: "new-note",
        label: "New note",
        icon: <Plus aria-hidden="true" className="size-5" />,
        variant: "primary" as const,
        hasPopup: true,
        active: newNoteOpen,
        onSelect: () =>
          newNoteOpen ? navigation.dismissOverlay() : navigation.showOverlay({ kind: "new-note" })
      },
      actions: {
        key: "actions",
        label: "Actions",
        icon: <EllipsisVertical aria-hidden="true" className="size-5" />,
        hasPopup: true,
        active: actionsOpen,
        badge: actionsBadge > 0 ? actionsBadge : undefined,
        badgeLabel: "notifications",
        onSelect: () =>
          actionsOpen ? navigation.dismissOverlay() : navigation.showOverlay({ kind: "actions" })
      }
    };
    return {
      left: bubbleLayout.left.map((id) => byId[id]),
      right: bubbleLayout.right.map((id) => byId[id])
    };
  }, [bubbleLayout, conflictCount, newNoteOpen, actionsOpen, actionsBadge, navigation]);
}
