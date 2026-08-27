import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

type OverlayEntry = {
  readonly dismiss: () => void;
  readonly getContainer: () => HTMLElement | null;
};

// Open overlays in mount order. Escape and Tab always target the last entry
// so a sheet opened on top of a drawer owns dismiss and the focus trap.
const overlayStack: OverlayEntry[] = [];
let keyListenerBound = false;

function onDocumentKeyDown(event: KeyboardEvent): void {
  const top = overlayStack[overlayStack.length - 1];
  if (!top) return;
  if (event.key === "Escape") {
    if (event.defaultPrevented) return;
    event.preventDefault();
    top.dismiss();
    return;
  }
  if (event.key !== "Tab") return;
  const container = top.getContainer();
  if (!container) return;
  trapTab(event, container);
}

function pushOverlay(entry: OverlayEntry): () => void {
  overlayStack.push(entry);
  if (!keyListenerBound) {
    document.addEventListener("keydown", onDocumentKeyDown);
    keyListenerBound = true;
  }
  return () => {
    const index = overlayStack.lastIndexOf(entry);
    if (index !== -1) overlayStack.splice(index, 1);
    if (overlayStack.length === 0 && keyListenerBound) {
      document.removeEventListener("keydown", onDocumentKeyDown);
      keyListenerBound = false;
    }
  };
}

function focusables(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
}

/**
 * Keep Tab inside `container`. Native tab order handles the interior; this
 * only wraps first↔last so focus cannot escape into the page behind the dialog.
 */
function trapTab(event: KeyboardEvent, container: HTMLElement): void {
  const elements = focusables(container);
  if (elements.length === 0) {
    event.preventDefault();
    return;
  }
  const first = elements[0];
  const last = elements[elements.length - 1];
  if (first === undefined || last === undefined) return;
  const active = document.activeElement;
  const outside = !container.contains(active);
  if (event.shiftKey) {
    if (active === first || outside) {
      event.preventDefault();
      last.focus();
    }
    return;
  }
  if (active === last || outside) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * Escape-to-dismiss, focus trap, and focus handling shared by the drawer and
 * every sheet.
 *
 * Focus moves to the first focusable element inside the panel when it opens and
 * returns to whatever was focused before, so a phone user who dismisses a sheet
 * lands back on the control that opened it rather than at the top of the page.
 * That holds whether the panel closes by prop or is unmounted outright, so a
 * caller is free to write either `<Sheet open={open} />` or `{open && <Sheet />}`.
 *
 * Tab/Shift+Tab stay inside the open panel (the `aria-modal` contract). Escape
 * dismisses the top-most registered overlay, not whichever mounted first.
 */
export function useDismissable({
  open,
  onDismiss
}: {
  readonly open: boolean;
  readonly onDismiss: () => void;
}): { readonly containerRef: React.RefObject<HTMLDivElement | null> } {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!open) return;
    return pushOverlay({
      dismiss: () => onDismissRef.current(),
      getContainer: () => containerRef.current
    });
  }, [open]);

  useEffect(() => {
    if (!open) {
      const restore = restoreFocusRef.current;
      restoreFocusRef.current = null;
      restore?.focus();
      return;
    }
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = containerRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    focusable?.focus();
  }, [open]);

  // The effect above restores focus when `open` goes false, but a caller that
  // writes `{open && <Sheet />}` unmounts the hook instead of re-rendering it
  // closed — and React runs cleanups on unmount, never effect bodies. Without
  // this, the panel's DOM is removed with focus inside it and the user lands on
  // <body>. After an ordinary close the ref is already null, so this is a no-op
  // and never double-focuses.
  useEffect(
    () => () => {
      const restore = restoreFocusRef.current;
      restoreFocusRef.current = null;
      restore?.focus();
    },
    []
  );

  return { containerRef };
}
