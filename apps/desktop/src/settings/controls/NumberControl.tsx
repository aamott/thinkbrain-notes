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
 * present. Calls `onChange(Number(value))` on input, but skips the call if:
 *   - the field was cleared (empty string) — the user is emptying the input,
 *     and `Number("") === 0` would silently stage a zero;
 *   - the parsed value is NaN (partial input);
 *   - the parsed value is outside the declared `min`/`max` range, so we never
 *     stage a value that would fail validation on save.
 */
export function NumberControl({ definition, value, onChange, disabled }: ControlProps) {
  const numericValue = typeof value === "number" ? value : Number(value ?? 0);

  return (
    <input
      type="number"
      id={definition.key}
      value={Number.isNaN(numericValue) ? "" : numericValue}
      min={definition.min}
      max={definition.max}
      disabled={disabled}
      onChange={(e) => {
        // Empty input: the user is clearing the field. Don't stage `0`
        // (Number("") === 0); leave the staged value untouched.
        if (e.target.value === "") return;
        const parsed = Number(e.target.value);
        // Guard NaN: don't stage an invalid numeric value (partial input).
        if (Number.isNaN(parsed)) return;
        // Clamp to declared range: the browser's native min/max attributes
        // don't enforce typed/spinner input, so reject out-of-range values
        // here to avoid staging something that will fail save-time validation.
        if (definition.min !== undefined && parsed < definition.min) return;
        if (definition.max !== undefined && parsed > definition.max) return;
        onChange(parsed);
      }}
      className="w-24 rounded-small border border-border bg-surface px-2 py-1 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
    />
  );
}
