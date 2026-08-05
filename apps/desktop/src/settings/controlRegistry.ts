/**
 * Control registry: maps control key strings to React components.
 *
 * Standard types auto-generate controls (boolean→toggle, string→text, etc.).
 * Definitions may override the auto-generated control by setting a `control`
 * key that maps to a component registered here via `registerControl`.
 *
 * The registry is a module-level singleton. Standard controls are pre-
 * registered at import time. Extensions register custom controls at app
 * startup. If a custom control key is set but not registered, the registry
 * falls back to the type-based control and logs a warning (fail loudly but
 * don't crash the UI).
 */

import type { ComponentType } from "react";
import type { SettingDefinition, SettingType } from "@thinkbrain/core";

import { ToggleControl } from "./controls/ToggleControl";
import { TextControl } from "./controls/TextControl";
import { NumberControl } from "./controls/NumberControl";
import { SelectControl } from "./controls/SelectControl";
import { PathControl } from "./controls/PathControl";

/**
 * Props every setting control receives.
 *
 * The control renders only the input element; the surrounding row (label,
 * description) is rendered by `SettingsContent`. `value` is the effective
 * value (staged > loaded > default) computed by the content area so the
 * control stays a pure presentational component.
 */
export interface ControlProps {
  /** The resolved setting definition (full key, type, options, min/max, etc.). */
  readonly definition: SettingDefinition;
  /** The current effective value to display. */
  readonly value: unknown;
  /** Called with the new value when the user interacts with the control. */
  readonly onChange: (value: unknown) => void;
  /** Disables the control when true. */
  readonly disabled?: boolean;
}

/** Maps control key strings to their React component implementations. */
const controlRegistry = new Map<string, ComponentType<ControlProps>>();

/**
 * Registers a custom control component under the given key.
 *
 * A definition with `control: key` will render this component instead of the
 * auto-generated type-based control. Re-registering the same key replaces the
 * prior component (last-wins), which supports hot-reload and test overrides.
 *
 * Args:
 *   key: The control key string matching `SettingDefinition.control`.
 *   component: The React component implementing `ControlProps`.
 */
export function registerControl(
  key: string,
  component: ComponentType<ControlProps>
): void {
  controlRegistry.set(key, component);
}

/**
 * Returns the standard control component for a primitive setting type.
 *
 * Throws if the type is unrecognized so schema bugs surface immediately.
 */
function getStandardControlForType(type: SettingType): ComponentType<ControlProps> {
  switch (type) {
    case "boolean":
      return ToggleControl;
    case "string":
      return TextControl;
    case "number":
      return NumberControl;
    case "enum":
      return SelectControl;
    case "path":
      return PathControl;
    default: {
      // Exhaustiveness guard: if a new type is added without a control, fail.
      const exhaustive: never = type;
      throw new Error(`No standard control registered for setting type: ${exhaustive}`);
    }
  }
}

/**
 * Resolves which React component should render a given setting definition.
 *
 * Resolution order:
 *  1. If `definition.control` is set and a component is registered for that
 *     key, return the registered custom component.
 *  2. Otherwise, return the standard control for `definition.type`.
 *  3. If `definition.control` is set but NOT registered, log a warning and
 *     fall back to the type-based control (fail loudly, don't crash).
 *
 * Args:
 *   def: The resolved setting definition.
 *
 * Returns:
 *   The React component type to render for this definition.
 */
export function getControlForDefinition(
  def: SettingDefinition
): ComponentType<ControlProps> {
  if (def.control) {
    const custom = controlRegistry.get(def.control);
    if (custom) return custom;
    // Custom key set but not registered: warn and fall back to type-based.
    console.warn(
      `[controlRegistry] No control registered for key "${def.control}" ` +
        `(setting "${def.key}"); falling back to type "${def.type}".`
    );
  }
  return getStandardControlForType(def.type);
}

// ---------------------------------------------------------------------------
// Pre-register standard controls so they're available immediately on import.
// ---------------------------------------------------------------------------

registerControl("toggle", ToggleControl);
registerControl("text", TextControl);
registerControl("number", NumberControl);
registerControl("select", SelectControl);
registerControl("path", PathControl);
