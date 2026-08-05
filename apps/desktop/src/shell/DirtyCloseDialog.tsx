import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { DesktopTab } from "../tabs/tabModel";

/**
 * Modal confirmation shown when closing a tab with unsaved changes.
 *
 * Offers Cancel / Discard / Save-and-close actions. Renders nothing when no
 * tab is pending confirmation (`tab` is null).
 *
 * Focus management: when the dialog opens we save the previously-focused
 * element and move focus into the dialog; when it closes we restore focus.
 * Tab/Shift+Tab are trapped within the dialog and Escape cancels. This
 * mirrors the pattern used by the command palette
 * (`paletteRestoreFocusRef` / `closePalette` in {@link DesktopShell}).
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
  const dialogRef = useRef<HTMLElement | null>(null);
  // The element that was focused when the dialog opened; restored on close.
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Single effect keyed on `tab` (the visibility prop): handles open (focus
  // save + initial focus) and close (focus restore). Re-runs only when the
  // dialog transitions between hidden/visible.
  useEffect(() => {
    if (tab === null) {
      // Closing: return focus to whatever had it before the dialog opened.
      restoreFocusRef.current?.focus();
      restoreFocusRef.current = null;
      return;
    }

    // Opening: remember the active element for later restore, then move
    // focus into the dialog (first focusable element, else the container).
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const dialog = dialogRef.current;
    if (dialog) {
      const firstFocusable = dialog.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      (firstFocusable ?? dialog).focus();
    }
  }, [tab]);

  /**
   * Keyboard handler for the dialog: Escape cancels, Tab/Shift+Tab wrap
   * within the dialog so focus can't escape to the (inert) background.
   */
  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusables = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
    if (focusables.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;

    if (event.shiftKey) {
      // Shift+Tab on the first element wraps to the last.
      if (active === first || !dialog.contains(active)) {
        event.preventDefault();
        last?.focus();
      }
    } else {
      // Tab on the last element wraps to the first.
      if (active === last || !dialog.contains(active)) {
        event.preventDefault();
        first?.focus();
      }
    }
  }

  if (!tab) return null;
  return (
    <div className="fixed inset-0 z-10 flex justify-center items-start pt-[15vh] bg-foreground/40" role="presentation">
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="grid gap-3 w-[min(25rem,calc(100vw-2rem))] p-[1.15rem] border border-border rounded-medium text-foreground bg-popover shadow-soft"
        role="dialog"
        aria-modal="true"
        aria-label="Unsaved changes"
        onKeyDown={handleKeyDown}
      >
        <h2 className="m-0 text-base font-semibold">Save changes to {tab.title}?</h2>
        <p className="m-0 text-muted-foreground text-xs leading-[1.45]">Closing this tab without saving will discard your edits.</p>
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
