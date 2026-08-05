/**
 * Text input control for string settings.
 *
 * Renders a controlled `<input type="text">` styled with theme tokens.
 */

import type { ControlProps } from "../controlRegistry";

/**
 * A controlled text input. Calls `onChange(e.target.value)` on every input.
 * The value is coerced to string to handle the `unknown` prop type safely.
 */
export function TextControl({ definition, value, onChange, disabled }: ControlProps) {
  return (
    <input
      type="text"
      id={definition.key}
      value={typeof value === "string" ? value : String(value ?? "")}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-full max-w-[24rem] rounded-small border border-border bg-surface px-2 py-1 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
    />
  );
}
