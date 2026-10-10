/**
 * Interface-size control for `ui.scale`.
 *
 * A `<select>` of preset percents rather than a free number field: the
 * setting applies on every staged change, so a type-in box made the whole
 * UI resize mid-edit (and out from under the pointer). Phones have no zoom
 * shortcuts at all, so the control also has to be touch-friendly. The stored
 * value stays a number — keyboard zoom can still land between presets, and
 * a value like that simply gets its own option rather than showing blank.
 */

import { inputClassName, type ControlProps } from "../controlRegistry";
import { UI_SCALE_PRESETS } from "../uiModuleDefaults";

/**
 * A controlled `<select>` of `UI_SCALE_PRESETS` rendered as `NN%`. A current
 * value outside the presets (staged by keyboard zoom or imported) is inserted
 * in sorted order so the selection always names what is actually applied.
 */
export function UiScaleControl({ definition, value, onChange, disabled }: ControlProps) {
  const current = typeof value === "number" && Number.isFinite(value) ? value : NaN;
  const options =
    !Number.isNaN(current) && !UI_SCALE_PRESETS.includes(current)
      ? [...UI_SCALE_PRESETS, current].sort((a, b) => a - b)
      : UI_SCALE_PRESETS;

  return (
    <select
      id={definition.key}
      value={Number.isNaN(current) ? "" : String(current)}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`w-28 ${inputClassName}`}
    >
      {Number.isNaN(current) && (
        <option value="" disabled>
          Select a value...
        </option>
      )}
      {options.map((percent) => (
        <option key={percent} value={percent}>
          {percent}%
        </option>
      ))}
    </select>
  );
}
