import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

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
   * control. Rendered there — measured before paint and flipped onto the other
   * side of the pointer only when it would otherwise run off the window, so it
   * can never paint and then jump.
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

  // Where the menu actually lands. It starts at the pointer; a layout effect —
  // which runs before the browser paints — measures the mounted menu and flips
  // it to open upward (bottom edge at the pointer) or leftward only when it
  // would overflow the window, so the wrong position is never seen.
  const [position, setPosition] = useState(at);
  useLayoutEffect(() => {
    if (!at) return;
    const rect = menuRef.current?.getBoundingClientRect();
    if (!rect) return;
    const next: MenuPosition = {
      x: at.x + rect.width > window.innerWidth ? Math.max(0, at.x - rect.width) : at.x,
      y: at.y + rect.height > window.innerHeight ? Math.max(0, at.y - rect.height) : at.y,
    };
    setPosition((prev) => (prev?.x === next.x && prev?.y === next.y ? prev : next));
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
        style: { left: `${position?.x ?? at.x}px`, top: `${position?.y ?? at.y}px` },
      }
    : { className: className ?? "" };

  const surface = (
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
  // A pointer-placed menu mounts at the root: a `fixed` element under a
  // transformed, filtered, or scrolling ancestor is contained by it — which
  // is how a dock's scrollbar ended up painted over a right-click menu.
  return at ? createPortal(surface, document.body) : surface;
}

/**
 * The shared menu-item styling, exported for compound rows — e.g. the action
 * items ⋯ menu, where an open-button and a pin-toggle sit side by side as two
 * `menuitem`s in one visual row.
 */
export const MENU_ITEM =
  "flex w-full min-w-0 items-center gap-2 border-0 px-3 py-[0.4rem] bg-transparent cursor-pointer font-inherit text-xs text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none";

/** The hairline between menu sections. */
export function MenuSeparator() {
  return <hr aria-hidden="true" className="my-1 border-0 border-t border-border" />;
}

/**
 * A single menu item rendered as a full-width button.
 *
 * `danger` renders a destructive action (e.g. Delete) in the danger color, and
 * `current` marks the one that is already the case — which is also the item
 * {@link Menu} opens on.
 */
export function MenuButton({
  label,
  ariaLabel,
  icon,
  danger = false,
  current = false,
  disabled = false,
  title,
  className,
  onClick,
}: {
  readonly label: string;
  readonly ariaLabel?: string;
  /** Drawn before the label, and never spoken — the label already says it. */
  readonly icon?: ReactNode;
  readonly danger?: boolean;
  readonly current?: boolean;
  readonly disabled?: boolean;
  /** The whole of what the label may have had to truncate. */
  readonly title?: string;
  /** Extra classes — e.g. `flex-1` when the item shares a row with a second control. */
  readonly className?: string;
  readonly onClick: (event: ReactMouseEvent) => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        MENU_ITEM,
        danger ? "text-danger" : "text-foreground",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      role="menuitem"
      aria-current={current ? "true" : undefined}
      aria-label={ariaLabel}
      title={title}
      disabled={disabled}
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
  className,
  onClick,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly className?: string;
  readonly onClick: (event: ReactMouseEvent) => void;
}) {
  return (
    <button
      type="button"
      className={cn(MENU_ITEM, "text-foreground", className)}
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
