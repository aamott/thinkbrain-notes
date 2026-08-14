/**
 * Text input control for string settings.
 *
 * Renders a controlled `<input type="text">` styled with theme tokens.
 */

import { inputClassName, type ControlProps } from "../controlRegistry";

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
      className={`w-full max-w-sm ${inputClassName}`}
    />
  );
}
