import { useDismissable } from "@thinkbrain/ui";
import type { DesktopTab } from "../tabs/tabModel";

/**
 * Modal confirmation shown when closing a tab with unsaved changes.
 *
 * Offers Cancel / Discard / Save-and-close actions. Renders nothing when no
 * tab is pending confirmation (`tab` is null).
 *
 * Escape, Tab trapping and focus save/restore come from `useDismissable`, the
 * overlay stack every sheet and menu registers with. The backdrop is
 * deliberately *not* dismissable — this dialog asks a question, and a stray
 * tap should not answer "discard".
 */
export function DirtyCloseDialog({
  tab,
  onCancel,
  onDiscard,
  onSave
}: {
  readonly tab: DesktopTab | null;
  readonly onCancel: () => void;
  readonly onDiscard: () => void;
  readonly onSave: () => void;
}) {
  const { containerRef } = useDismissable({ open: tab !== null, onDismiss: onCancel });

  if (!tab) return null;
  return (
    <div className="fixed inset-0 z-10 flex justify-center items-start pt-[15vh] bg-foreground/40" role="presentation">
      <section
        ref={containerRef}
        tabIndex={-1}
        className="grid gap-3 w-[min(25rem,calc(100vw-2rem))] p-[1.15rem] border border-border rounded-medium text-foreground bg-popover shadow-soft"
        role="dialog"
        aria-modal="true"
        aria-label="Unsaved changes"
      >
        <h2 className="m-0 text-base font-semibold">Save changes to {tab.title}?</h2>
        <p className="m-0 text-muted-foreground text-xs leading-1.45">Closing this tab without saving will discard your edits.</p>
        <div className="flex flex-wrap justify-end gap-[0.45rem]">
          <button
            type="button"
            className="border border-border rounded-small py-[0.4rem] px-[0.6rem] text-foreground bg-surface cursor-pointer font-inherit text-xs"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="border border-border rounded-small py-[0.4rem] px-[0.6rem] text-foreground bg-surface cursor-pointer font-inherit text-xs"
            onClick={onDiscard}
          >
            Discard
          </button>
          <button
            type="button"
            className="border border-border rounded-small py-[0.4rem] px-[0.6rem] text-primary-foreground bg-primary cursor-pointer font-inherit text-xs"
            onClick={onSave}
          >
            Save and close
          </button>
        </div>
      </section>
    </div>
  );
}
