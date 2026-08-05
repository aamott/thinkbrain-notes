import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";

/**
 * Thin draggable divider between shell panels.
 *
 * Renders a 1px column-resize handle. Pointer and keyboard events are delegated
 * to the parent so it can drive the resize logic. Hidden below the 760px
 * breakpoint where the multi-column layout collapses.
 */
export function ResizeHandle({
  label,
  onPointerDown,
  onKeyDown
}: {
  label: string;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      className="relative flex-[0_0_1px] p-0 border-0 bg-border cursor-col-resize hover:bg-primary focus-visible:bg-primary focus-visible:outline-none max-[760px]:hidden"
      aria-label={`${label}. Use arrow keys to resize.`}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    />
  );
}
