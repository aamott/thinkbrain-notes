/**
 * Toggle switch control for boolean settings.
 *
 * Renders an accessible `<button role="switch">` styled with theme tokens.
 * The label/description are rendered by the parent row; this component is
 * only the interactive input element.
 */

import { cn } from "../../lib/utils";
import type { ControlProps } from "../controlRegistry";

/**
 * A boolean toggle switch.
 *
 * Clicking flips the value and calls `onChange(!value)`. Uses ARIA
 * `role="switch"` + `aria-checked` for screen-reader compatibility.
 */
export function ToggleControl({ definition, value, onChange, disabled }: ControlProps) {
  // Treat only true booleans as checked; any non-boolean (corrupted state,
  // stale value, undefined) defaults to false rather than coercing truthy
  // non-booleans (e.g. the string "false", the number 1) to true. This keeps
  // the toggle's state honest and surfaces corruption as "off" instead of
  // silently appearing enabled.
  const checked = typeof value === "boolean" ? value : false;

  return (
    <button
      type="button"
      role="switch"
      id={definition.key}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        checked ? "bg-primary" : "bg-secondary",
        disabled && "opacity-50"
      )}
    >
      <span
        className={cn(
          "size-4 rounded-full bg-background shadow-sm transition-transform",
          checked ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  );
}
