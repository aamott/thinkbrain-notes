import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";

/**
 * Shared keyboard navigation for menu-like containers whose items are
 * `<button role="menuitem">` elements inside `menuRef`. Handles ArrowDown/
 * ArrowUp (with wrap-around), Home, End, and Escape (delegated to `onClose`
 * so callers plug in their own close semantics — e.g. restoring focus to a
 * trigger button).
 *
 * Extracted here so `shell/ContextMenu.tsx` and `workspace/WorkspaceExplorer.tsx`
 * share one implementation instead of duplicating it.
 */
export function handleMenuKeyDown(
  event: ReactKeyboardEvent,
  menuRef: RefObject<HTMLDivElement | null>,
  onClose: () => void
): void {
  const items = Array.from(
    menuRef.current?.querySelectorAll<HTMLButtonElement>("button[role='menuitem']") ?? []
  );
  if (!items.length) return;
  const index = items.indexOf(document.activeElement as HTMLButtonElement);
  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
      break;
    case "ArrowUp":
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
      break;
    case "Home":
      event.preventDefault();
      items[0]?.focus();
      break;
    case "End":
      event.preventDefault();
      items[items.length - 1]?.focus();
      break;
    case "Escape":
      event.preventDefault();
      onClose();
      break;
  }
}
