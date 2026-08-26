import { useEffect, useRef } from "react";

/**
 * Escape-to-dismiss and focus handling shared by the drawer and every sheet.
 *
 * Focus moves to the first focusable element inside the panel when it opens and
 * returns to whatever was focused before, so a phone user who dismisses a sheet
 * lands back on the control that opened it rather than at the top of the page.
 * That holds whether the panel closes by prop or is unmounted outright, so a
 * caller is free to write either `<Sheet open={open} />` or `{open && <Sheet />}`.
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

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      onDismiss();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onDismiss]);

  useEffect(() => {
    if (!open) {
      const restore = restoreFocusRef.current;
      restoreFocusRef.current = null;
      restore?.focus();
      return;
    }
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = containerRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
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
