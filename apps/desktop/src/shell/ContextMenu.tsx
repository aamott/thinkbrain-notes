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
import { handleMenuKeyDown } from "./menuKeyboard";

/** Position of a context menu, in viewport coordinates. */
export interface ContextMenuState {
  readonly x: number;
  readonly y: number;
}

/**
 * Positioned context menu wrapper. Clamps to the viewport, auto-focuses the
 * first item on mount, supports keyboard navigation, and closes on outside
 * click or Escape. Children are the menu items (typically `MenuButton`s).
 */
export function ContextMenu({
  state,
  onClose,
  anchorRef,
  children,
}: {
  readonly state: ContextMenuState;
  readonly onClose: () => void;
  /**
   * The control that opened the menu, where one exists.
   *
   * A menu opened by a toggle has to know its own trigger: without this the
   * press that closes it counts as an outside click first, and the menu shuts
   * and reopens in the same gesture. A menu raised by a right-click has no
   * such control and leaves this out.
   */
  readonly anchorRef?: RefObject<HTMLElement | null>;
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
      const target = event.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        !anchorRef?.current?.contains(target)
      ) {
        onClose();
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [onClose, anchorRef]);

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

/**
 * A menu item that stays open and carries its own on/off state.
 *
 * The tick is drawn rather than spoken: `aria-checked` already says whether the
 * item is on, so letting the glyph into the accessible name would have a screen
 * reader announce it twice.
 */
export function MenuCheckbox({
  label,
  checked,
  onClick,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly onClick: (event: ReactMouseEvent) => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 border-0 px-3 py-[0.4rem] bg-transparent cursor-pointer font-inherit text-xs text-left text-foreground hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
      role="menuitemcheckbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onClick}
    >
      <span aria-hidden="true" className="w-3">
        {checked ? "✓" : ""}
      </span>
      {label}
    </button>
  );
}
