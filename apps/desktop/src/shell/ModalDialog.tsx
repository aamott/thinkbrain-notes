import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useDismissable } from "@thinkbrain/ui";

/**
 * The one modal dialog shell.
 *
 * Owns everything a dialog *is* rather than what it says: the portal to
 * `document.body`, the scrim, the inert background, Escape/Android-Back
 * dismissal and the focus trap (both via the shared overlay stack in
 * `useDismissable`, so a dialog opened above another one owns dismiss and Tab
 * until it closes). Dialogs render their own contents — a confirmation's
 * buttons, a manager's list — inside.
 */

/**
 * Live modal containers in mount order, and what the app background's `inert`
 * was before the first of them took it. A stack rather than a per-dialog
 * toggle because dialogs nest: the manager stays open under its delete
 * confirmation, and restoring the background while a lower dialog is still up
 * would leave it interactive behind a scrim it cannot dismiss.
 */
const modalStack: HTMLElement[] = [];
let backgroundWasInert = false;
let background: HTMLElement | null = null;

/**
 * Keeps `inert` honest for the background and every stacked dialog.
 *
 * The background is whatever the app renders into — `#root`, or in tests the
 * explorer section itself when there is no `#root` (the original callers of
 * this pattern mounted the explorer directly, so that fallback is kept on
 * purpose). Among dialogs, everything but the top of the stack is inert.
 */
function syncInertState(): void {
  if (background) {
    background.inert = modalStack.length > 0 ? true : backgroundWasInert;
  }
  modalStack.forEach((element, index) => {
    element.inert = index < modalStack.length - 1;
  });
}

export function ModalDialog({
  title,
  description,
  busy = false,
  onDismiss,
  size = "sm",
  children
}: {
  readonly title: string;
  readonly description?: ReactNode;
  readonly busy?: boolean;
  readonly onDismiss: () => void;
  /**
   * `sm` is a centered card; `lg` is a full-screen sheet on narrow screens and
   * a centered, scrollable card from `sm` up.
   */
  readonly size?: "sm" | "lg";
  readonly children: ReactNode;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dismiss = () => {
    if (!busy) onDismiss();
  };

  const dialogRef = useRef<HTMLDivElement>(null);
  // Stacked dialogs raise their layer: the delete confirm's scrim must sit
  // *above* the manager it dims, so z-index derives from stack depth, not a
  // fixed class.
  const [zBase, setZBase] = useState(40);

  // Declared before useDismissable so this cleanup runs first on unmount:
  // the background must become interactive again before focus is restored to
  // an element inside it.
  //
  // The dialog joins the modal stack while mounted: the background and every
  // dialog beneath the newest one go inert, so Escape and Tab (handled by the
  // overlay stack in `useDismissable`) and the inert tree agree about which
  // dialog is alive.
  useEffect(() => {
    const element = dialogRef.current;
    // The first dialog on the stack claims the background and remembers its
    // inert flag; resolving it here — rather than inside `syncInertState` —
    // is what keeps a torn-down section from staying the target.
    if (modalStack.length === 0) {
      background =
        document.getElementById("root") ??
        document.querySelector<HTMLElement>('section[aria-label="Workspace explorer"]');
      backgroundWasInert = background?.inert ?? false;
    }
    if (element) modalStack.push(element);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- The layer follows stack position, which only exists once mounted.
    setZBase(40 + (modalStack.length - 1) * 10);
    syncInertState();
    return () => {
      if (element) {
        const index = modalStack.indexOf(element);
        if (index !== -1) modalStack.splice(index, 1);
      }
      syncInertState();
      if (modalStack.length === 0) background = null;
    };
  }, []);

  const { containerRef } = useDismissable({ open: true, onDismiss: dismiss });
  const attachRef = (element: HTMLDivElement | null) => {
    dialogRef.current = element;
    containerRef.current = element;
  };

  // `useDismissable` lands focus on the first focusable element; a dialog may
  // mark a better landing spot (e.g. the manager's filter input) with
  // `data-initial-focus`. Declared after it so this runs last on mount.
  useEffect(() => {
    dialogRef.current
      ?.querySelector<HTMLElement>("[data-initial-focus]")
      ?.focus();
  }, []);

  const frame =
    size === "lg"
      ? "fixed inset-0 flex flex-col bg-background text-foreground sm:inset-auto sm:left-1/2 sm:top-[10vh] sm:w-[min(40rem,calc(100vw-2rem))] sm:max-h-[80vh] sm:-translate-x-1/2 sm:rounded-medium sm:border sm:border-border sm:bg-popover sm:shadow-soft"
      : "fixed left-1/2 top-[18vh] grid w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 gap-3 rounded-medium border border-border bg-popover p-4 text-foreground shadow-soft";

  return createPortal(
    <>
      <div
        aria-hidden="true"
        className="fixed inset-0 bg-overlay"
        style={{ zIndex: zBase }}
        onClick={dismiss}
      />
      <div
        ref={attachRef}
        style={{ zIndex: zBase + 5 }}
        role="dialog"
        aria-modal="true"
        aria-busy={busy}
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={frame}
      >
        {size === "lg" ? (
          <>
            <div className="flex items-center gap-2 border-b border-border p-4">
              <h2 id={titleId} className="m-0 flex-1 text-base font-semibold">
                {title}
              </h2>
              <button
                type="button"
                aria-label="Close"
                className="flex size-8 items-center justify-center rounded-small text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:size-11"
                onClick={dismiss}
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>
            {description && (
              <p id={descriptionId} className="m-0 px-4 pt-3 text-xs leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">{children}</div>
          </>
        ) : (
          <>
            <h2 id={titleId} className="m-0 text-base font-semibold">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="m-0 text-xs leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
            {children}
          </>
        )}
      </div>
    </>,
    document.body
  );
}
