/**
 * Select dropdown control for enum settings.
 *
 * Renders a `<select>` with `<option>` elements from `definition.options`.
 */

import type { ControlProps } from "../controlRegistry";

/**
 * A controlled `<select>` dropdown. Options come from `definition.options`
 * (the enum's allowed values). Calls `onChange(e.target.value)` on change.
 */
export function SelectControl({ definition, value, onChange, disabled }: ControlProps) {
  const options = definition.options ?? [];
  const selected = typeof value === "string" ? value : String(value ?? "");

  return (
    <select
      id={definition.key}
      value={selected}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-full max-w-[24rem] rounded-small border border-border bg-surface px-2 py-1 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}
