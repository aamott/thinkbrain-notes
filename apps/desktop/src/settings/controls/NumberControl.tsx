/**
 * Number input control for numeric settings.
 *
 * Renders a controlled `<input type="number">` with optional `min`/`max`
 * from the setting definition. Guards against NaN so invalid input doesn't
 * propagate to the store.
 */

import type { ControlProps } from "../controlRegistry";

/**
 * A controlled number input. Applies `min`/`max` from the definition when
 * present. Calls `onChange(Number(value))` on input, but skips the call if
 * the parsed value is NaN (e.g. empty or partial input) to avoid staging
 * invalid values.
 */
export function NumberControl({ definition, value, onChange, disabled }: ControlProps) {
  const numericValue = typeof value === "number" ? value : Number(value ?? 0);

  return (
    <input
      type="number"
      value={Number.isNaN(numericValue) ? "" : numericValue}
      min={definition.min}
      max={definition.max}
      disabled={disabled}
      onChange={(e) => {
        const parsed = Number(e.target.value);
        // Guard NaN: don't stage an invalid numeric value.
        if (!Number.isNaN(parsed)) onChange(parsed);
      }}
      className="w-24 rounded-small border border-border bg-surface px-2 py-1 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
    />
  );
}
