import { useDismissable } from "@thinkbrain/ui";

import type { RightPanel } from "../shellTypes";
import {
  useRightPanelContributions,
  type RightPanelContext
} from "../../panels/panelRegistryModel";
import { PanelIcon } from "../panelIcons";
import { cn } from "../../lib/utils";

// The outside-dismiss layer and the menu are bounded between the phone header
// and the bottom hub so the hub stays visible and tappable — same bounds the
// inspector drawer uses.
const BOUNDS =
  "top-[calc(3.5rem+env(safe-area-inset-top))] bottom-[calc(3.5rem+env(safe-area-inset-bottom))]";

/**
 * The phone's action-items menu — the compact dropdown the header `…` opens,
 * listing every right-panel contribution (outline, properties, backlinks,
 * extension panels) in registry order. This is the drill-in surface for the
 * right-side inspector drawer: choosing an entry opens that panel's inspector.
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
  rootPath,
  documentContents,
  onDismiss,
  onSelect
}: {
  readonly open: boolean;
  readonly rootPath: string | null;
  /** Markdown contents of the active editor tab, when its document is ready. */
  readonly documentContents: string | null;
  /** Outside tap or Escape. */
  readonly onDismiss: () => void;
  readonly onSelect: (panel: RightPanel) => void;
}) {
  const { containerRef } = useDismissable({ open, onDismiss });
  const panels = useRightPanelContributions();
  const context: RightPanelContext = { rootPath, documentContents };

  return (
    // One bounded layer doubles as the undimmed outside-dismiss target; the
    // compact menu hangs inside it at the top-right and sizes to its content,
    // so a short list does not stretch header-to-hub.
    <div
      aria-hidden={!open}
      className={cn(
        "absolute inset-x-0 z-40",
        BOUNDS,
        open ? "visible" : "invisible"
      )}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <div
        ref={containerRef}
        role={open ? "menu" : undefined}
        aria-label="Action items"
        className={cn(
          "absolute top-0 right-2 max-h-full w-60 overflow-y-auto rounded-medium border border-border bg-surface py-1 text-foreground shadow-panel"
        )}
      >
        {panels.map((entry) => {
          const available = entry.availability?.(context) ?? true;
          return (
            <button
              key={entry.id}
              type="button"
              role="menuitem"
              disabled={!available}
              aria-label={entry.label}
              className={cn(
                "flex min-h-11 w-full items-center gap-3 bg-transparent border-0 px-4 py-2 text-left text-sm cursor-pointer tn-focus-ring",
                available
                  ? "text-foreground hover:bg-muted"
                  : "cursor-not-allowed text-muted-foreground opacity-60"
              )}
              onClick={() => onSelect(entry.id)}
            >
              <span className="inline-flex shrink-0 [&>svg]:size-4">
                <PanelIcon name={entry.icon} />
              </span>
              <span className="min-w-0 flex-1 truncate">{entry.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
