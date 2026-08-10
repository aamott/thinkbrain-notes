import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from "react";

import { cn } from "../lib/utils";

/** Position of a context menu, in viewport coordinates. */
export interface ContextMenuState {
  readonly x: number;
  readonly y: number;
}

/**
 * Shared keyboard navigation for context menus: ArrowUp/Down with wrap,
 * Home/End jumps, and Escape closes. Internal to this module.
 */
function handleMenuKeyDown(
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

/**
 * Positioned context menu wrapper. Clamps to the viewport, auto-focuses the
 * first item on mount, supports keyboard navigation, and closes on outside
 * click or Escape. Children are the menu items (typically `MenuButton`s).
 */
export function ContextMenu({
  state,
  onClose,
  children,
}: {
  readonly state: ContextMenuState;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Keep the menu inside the viewport.
  const [position, setPosition] = useState({ x: state.x, y: state.y });
  useEffect(() => {
    const element = menuRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const x = Math.min(state.x, window.innerWidth - rect.width - 8);
    const y = Math.min(state.y, window.innerHeight - rect.height - 8);
    setPosition({ x: Math.max(8, x), y: Math.max(8, y) });
  }, [state.x, state.y]);

  // Auto-focus the first item for keyboard navigation.
  useEffect(() => {
    const firstButton = menuRef.current?.querySelector("button");
    firstButton?.focus();
  }, []);

  // Close on outside click.
  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [onClose]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    handleMenuKeyDown(event, menuRef, onClose);
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-44 border border-border rounded-small bg-popover shadow-soft py-1 text-xs"
      role="menu"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      onKeyDown={handleKeyDown}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}

/**
 * A single context menu item rendered as a full-width button. Use `danger`
 * for destructive actions (e.g. Delete) to render in the danger color.
 */
export function MenuButton({
  label,
  danger = false,
  onClick,
}: {
  readonly label: string;
  readonly danger?: boolean;
  readonly onClick: (event: ReactMouseEvent) => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2 border-0 px-3 py-[0.4rem] bg-transparent cursor-pointer font-inherit text-xs text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
        danger ? "text-danger" : "text-foreground"
      )}
      role="menuitem"
      onClick={onClick}
    >
      {label}
    </button>
  );
}
