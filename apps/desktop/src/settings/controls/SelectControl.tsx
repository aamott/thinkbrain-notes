/**
 * Select dropdown control for enum settings.
 *
 * Renders a `<select>` with `<option>` elements from `definition.options`.
 */

import { inputClassName, type ControlProps } from "../controlRegistry";

/**
 * A controlled `<select>` dropdown. Options come from `definition.options`
 * (the enum's allowed values). Calls `onChange(e.target.value)` on change.
 */
export function SelectControl({ definition, value, onChange, disabled }: ControlProps) {
  const options = definition.options ?? [];
  const selected = typeof value === "string" ? value : String(value ?? "");
  // When the current value isn't one of the allowed options (e.g. corrupted
  // state or a stale value from an older schema), render a disabled
  // placeholder so the dropdown shows an explicit "no selection" hint rather
  // than a silently blank selection.
  const valueMatchesOption = options.includes(selected);

  return (
    <select
      id={definition.key}
      value={selected}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full max-w-sm ${inputClassName}`}
    >
      {!valueMatchesOption && (
        <option value="" disabled>
          Select a value...
        </option>
      )}
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}
