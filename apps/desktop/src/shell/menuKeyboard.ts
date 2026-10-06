import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";

/**
 * Shared keyboard navigation for menu-like containers whose items are
 * `<button role="menuitem">` elements inside `container`. Handles ArrowDown/
 * ArrowUp (with wrap-around), Home, End, and Escape (delegated to `onClose`
 * so callers plug in their own close semantics — e.g. restoring focus to a
 * trigger button).
 *
 * `container` accepts either the menu element itself (for callers wiring this
 * as the menu's own `onKeyDown`, where `event.currentTarget` is already the
 * container) or a ref holding it (for surfaces like `Menu` that keep the ref
 * for measurement too).
 *
 * Escape only fires `onClose` — and only preventDefaults — when a caller is
 * provided. Menus already inside the `useDismissable` overlay stack leave it
 * out: their document-level listener owns Escape, and a swallowed
 * `preventDefault` here would block it.
 *
 * Kept apart from `shell/Menu.tsx` because it is the one piece of menu
 * behaviour a caller might want without the surface around it.
 */
export function handleMenuKeyDown(
  event: ReactKeyboardEvent,
  container: RefObject<HTMLDivElement | null> | HTMLElement,
  onClose?: () => void
): void {
  const menu = container instanceof HTMLElement ? container : container.current;
  const items = Array.from(
    // Prefix-matched so a checkable item (`menuitemcheckbox`) is navigable on
    // the same terms as a plain one; a menu that skipped them would leave the
    // arrow keys stepping over half its contents.
    menu?.querySelectorAll<HTMLButtonElement>(
      "button[role^='menuitem']:not(:disabled)"
    ) ?? []
  );
  if (!items.length) return;
  // `index` is -1 while focus sits outside the menu (e.g. it never moved in).
  // Down lands on the first item, Up on the last — not a phantom step from -1.
  const index = items.indexOf(document.activeElement as HTMLButtonElement);
  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
      break;
    case "ArrowUp":
      event.preventDefault();
      items[index <= 0 ? items.length - 1 : index - 1]?.focus();
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
      if (onClose === undefined) return;
      event.preventDefault();
      onClose();
      break;
  }
}
