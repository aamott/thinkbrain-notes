import type { RightPanel } from "../shellTypes";
import {
  useRightPanelContributions,
  type RightPanelContext
} from "../../panels/panelRegistryModel";
import { PanelIcon } from "../panelIcons";
import { PhoneMenuRow } from "./PhoneMenuRow";
import { BubbleMenuShell } from "./BubbleMenuShell";

/**
 * The phone's action-items menu — the compact dropdown the ⋮ bubble opens,
 * listing every right-panel contribution (version history, outline,
 * properties, backlinks, extension panels) in registry order. This is the
 * drill-in surface for the right-side inspector drawer: choosing an entry
 * opens that panel's inspector.
 *
 * It is intentionally a small anchored menu, not a drawer or bottom sheet:
 * a menu is a quick pick that closes on choice, which is exactly the shape
 * "open the outline for this note" wants. Extension contributions appear with
 * no mobile-specific work because the source is the same
 * `useRightPanelContributions()` the desktop action-items surface reads.
 *
 * Options whose `availability` resolves false stay visible but disabled — a
 * missing action is more confusing than a greyed one.
 */
export function ActionItemsMenu({
  open,
  context,
  onDismiss,
  onSelect
}: {
  readonly open: boolean;
  /** The right-side context the shell already built for this document — the
   *  same object the inspector reads, so availability and contents agree. */
  readonly context: RightPanelContext;
  /** Outside tap or Escape. */
  readonly onDismiss: () => void;
  readonly onSelect: (panel: RightPanel) => void;
}) {
  const panels = useRightPanelContributions();

  return (
    // The shared shell owns the dismiss layer (spanning the whole shell —
    // bubbles included — so a tap on the ⋮ bubble closes rather than
    // retriggers), Escape, and roving focus; this menu is only the rows.
    <BubbleMenuShell
      name="actions"
      label="Action items"
      open={open}
      menuClassName="right-3 w-60 py-1"
      onDismiss={onDismiss}
    >
      {panels.map((entry) => {
        const available = entry.availability?.(context) ?? true;
        return (
          <PhoneMenuRow
            key={entry.id}
            icon={<PanelIcon name={entry.icon} />}
            label={entry.label}
            disabled={!available}
            onSelect={() => onSelect(entry.id)}
          />
        );
      })}
    </BubbleMenuShell>
  );
}
