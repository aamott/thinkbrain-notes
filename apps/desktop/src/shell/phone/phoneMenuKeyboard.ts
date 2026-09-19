import type { KeyboardEvent as ReactKeyboardEvent } from "react";

/** Roving-focus arrow/Home/End navigation shared by phone `role="menu"` lists. */
export function handlePhoneMenuKeyDown(event: ReactKeyboardEvent<HTMLElement>): void {
  const key = event.key;
  if (key !== "ArrowDown" && key !== "ArrowUp" && key !== "Home" && key !== "End") return;
  const items = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)')
  );
  if (items.length === 0) return;
  event.preventDefault();
  const current = items.indexOf(document.activeElement as HTMLElement);
  const next =
    current === -1
      ? key === "ArrowUp" || key === "End"
        ? items.length - 1
        : 0
      : key === "Home"
        ? 0
        : key === "End"
          ? items.length - 1
          : (current + (key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
  items[next]?.focus();
}
