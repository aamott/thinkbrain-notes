import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from "react";

import { cn } from "../lib/utils";
import { handleMenuKeyDown } from "./menuKeyboard";

/** Where a menu was asked for, in viewport coordinates. */
export interface MenuPosition {
  readonly x: number;
  readonly y: number;
}

/**
 * Why a menu is closing.
 *
 * Not every reason deserves the same follow-up: leaving by Escape should put
 * focus back where it came from, and clicking somewhere else should not, since
 * the click has already decided where focus belongs.
 */
export type MenuCloseReason = "escape" | "outside";

/**
 * The one menu surface in the app.
 *
 * Everything about how a menu *behaves* lives here — which item takes focus,
 * arrow keys, Escape, closing when the user goes elsewhere — so that a menu
 * raised by a right-click, one hanging off a toolbar button and one opening
 * upwards out of a footer are the same thing in three places rather than three
 * things that resemble each other.
 *
 * Only placement is the caller's: pass `at` for a menu that belongs where the
 * pointer was, or position it yourself with `className` for one that belongs to
 * a control. Everything else it looks like is fixed.
 */
export function Menu({
  label,
  id,
  at,
  className,
  onClose,
  anchorRef,
  children,
}: {
  /**
   * What the menu is called, for anyone who cannot see where it opened.
   *
   * A menu raised from a specific thing needs one — "Workspace actions" says
   * what a list of unlabelled verbs is about. One raised from a button the
   * reader just pressed does not, and gets none rather than a repetition.
   */
  readonly label?: string;
  /** For a trigger that names its menu with `aria-controls`. */
  readonly id?: string;
  /**
   * Where the pointer was, for a menu that belongs to a place rather than to a
   * control. Clamped so a right-click near an edge still opens on screen.
   */
  readonly at?: MenuPosition;
  /** Placement for a menu that hangs off a control. Ignored when `at` is set. */
  readonly className?: string;
  readonly onClose: (reason: MenuCloseReason) => void;
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

  // Keep a pointer-placed menu inside the viewport.
  const [position, setPosition] = useState<MenuPosition | null>(at ?? null);
  useEffect(() => {
    const element = menuRef.current;
    if (!at || !element) return;
    const rect = element.getBoundingClientRect();
    const x = Math.min(at.x, window.innerWidth - rect.width - 8);
    const y = Math.min(at.y, window.innerHeight - rect.height - 8);
    setPosition({ x: Math.max(8, x), y: Math.max(8, y) });
  }, [at]);

  // The item to land on: whichever one is already the answer, or the first.
  // Opening a list of workspaces on the one you are in is the difference
  // between reading it and searching it.
  useEffect(() => {
    const menu = menuRef.current;
    const current = menu?.querySelector<HTMLButtonElement>("button[aria-current='true']");
    (current ?? menu?.querySelector("button"))?.focus();
  }, []);

  // Close when the user goes elsewhere, or presses Escape from anywhere. The
  // window listener matters because focus can leave a menu — by Tab, or by a
  // control that took it — and Escape should still be the way out.
  useEffect(() => {
    const closeOnOutsidePointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        !anchorRef?.current?.contains(target)
      ) {
        onClose("outside");
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose("escape");
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose, anchorRef]);

  // Escape reaches `onClose` from here as well when focus is inside, which is
  // the ordinary case. Closing twice costs nothing — every caller's close is
  // setting a flag to false.
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    handleMenuKeyDown(event, menuRef, () => onClose("escape"));
  };

  const placement: { className: string; style?: CSSProperties } = at
    ? {
        className: "fixed z-50",
        style: { left: `${(position ?? at).x}px`, top: `${(position ?? at).y}px` },
      }
    : { className: className ?? "" };

  return (
    <div
      ref={menuRef}
      id={id}
      className={cn(
        "min-w-44 border border-border rounded-small bg-popover text-popover-foreground shadow-soft py-1 text-xs",
        placement.className
      )}
      role="menu"
      aria-label={label}
      style={placement.style}
      onKeyDown={handleKeyDown}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}

const ITEM =
  "flex w-full min-w-0 items-center gap-2 border-0 px-3 py-[0.4rem] bg-transparent cursor-pointer font-inherit text-xs text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none";

/**
 * A single menu item rendered as a full-width button.
 *
 * `danger` renders a destructive action (e.g. Delete) in the danger color, and
 * `current` marks the one that is already the case — which is also the item
 * {@link Menu} opens on.
 */
export function MenuButton({
  label,
  icon,
  danger = false,
  current = false,
  title,
  onClick,
}: {
  readonly label: string;
  /** Drawn before the label, and never spoken — the label already says it. */
  readonly icon?: ReactNode;
  readonly danger?: boolean;
  readonly current?: boolean;
  /** The whole of what the label may have had to truncate. */
  readonly title?: string;
  readonly onClick: (event: ReactMouseEvent) => void;
}) {
  return (
    <button
      type="button"
      className={cn(ITEM, danger ? "text-danger" : "text-foreground")}
      role="menuitem"
      aria-current={current ? "true" : undefined}
      title={title}
      onClick={onClick}
    >
      {icon && (
        <span
          aria-hidden="true"
          className="flex-none [&>svg]:w-[0.9rem] [&>svg]:h-[0.9rem] [&>svg]:stroke-current"
        >
          {icon}
        </span>
      )}
      <span className="truncate">{label}</span>
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
      className={cn(ITEM, "text-foreground")}
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
