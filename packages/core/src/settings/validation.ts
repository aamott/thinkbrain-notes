/**
 * Validation runner for the modular settings system.
 *
 * For each definition in the registry, if a value is present in `values`, this
 * module runs built-in type/range/enum checks and then the definition's custom
 * `validation` function (if any). Missing keys are NOT errors — defaults fill
 * them downstream. All diagnostics are returned with `severity: "error"` and
 * `path` set to the full setting key.
 */

import type { SettingsRegistry } from "./registry";
import type { SettingDefinition } from "./types";
import type { SettingsDiagnostic } from "../settings";

/**
 * Validates a flat `fullKey -> value` map against the registry's definitions.
 *
 * Args:
 *   registry: The settings registry providing definitions.
 *   values: Current setting values keyed by full setting key.
 *
 * Returns:
 *   Diagnostics for every invalid present value. An empty array means all
 *   present values are valid. Missing keys produce no diagnostics.
 */
export function validateSettings(
  registry: SettingsRegistry,
  values: Readonly<Record<string, unknown>>
): SettingsDiagnostic[] {
  const diagnostics: SettingsDiagnostic[] = [];

  for (const def of registry.getAllDefinitions()) {
    if (!(def.key in values)) continue;
    const value = values[def.key];
    diagnostics.push(...validateDefinition(def, value));
  }

  return diagnostics;
}

/**
 * Runs built-in checks then the definition's custom validator for one value.
 */
function validateDefinition(
  def: SettingDefinition,
  value: unknown
): SettingsDiagnostic[] {
  const diagnostics: SettingsDiagnostic[] = [];

  // Built-in type check first; skip range/enum if the type is wrong.
  const typeError = checkType(def, value);
  if (typeError) {
    diagnostics.push(typeError);
    return diagnostics; // Range/enum checks are meaningless on a wrong type.
  }

  const rangeError = checkRange(def, value);
  if (rangeError) diagnostics.push(rangeError);

  const enumError = checkEnum(def, value);
  if (enumError) diagnostics.push(enumError);

  // Custom validator runs last so authors can layer domain-specific rules on
  // top of the structural checks.
  if (def.validation) {
    const message = def.validation(value);
    if (message) {
      diagnostics.push({
        code: "settings.validation.failed",
        message,
        severity: "error",
        path: def.key
      });
    }
  }

  return diagnostics;
}

/** Verifies the runtime value matches the declared `type`. */
function checkType(
  def: SettingDefinition,
  value: unknown
): SettingsDiagnostic | undefined {
  switch (def.type) {
    case "boolean":
      if (typeof value !== "boolean") {
        return mismatch(def, `Expected boolean, received ${typeof value}.`);
      }
      return undefined;
    case "string":
      if (typeof value !== "string") {
        return mismatch(def, `Expected string, received ${typeof value}.`);
      }
      return undefined;
    case "number":
      if (typeof value !== "number" || Number.isNaN(value)) {
        return mismatch(def, `Expected number, received ${typeof value}.`);
      }
      return undefined;
    case "enum":
    case "path":
      // enum membership is checked separately; path is a string subtype.
      // A `path` setting may legitimately be `null` (the "no path set"
      // sentinel used when `default: null`), so null is accepted here. Non-
      // string, non-null values still fail loudly.
      if (def.type === "path" && value === null) {
        return undefined;
      }
      if (typeof value !== "string") {
        return mismatch(def, `Expected string, received ${typeof value}.`);
      }
      return undefined;
    default:
      return undefined;
  }
}

/** Verifies a number value respects `min`/`max` bounds (inclusive). */
function checkRange(
  def: SettingDefinition,
  value: unknown
): SettingsDiagnostic | undefined {
  if (def.type !== "number" || typeof value !== "number") return undefined;

  // `Infinity`/`-Infinity` pass `typeof === "number"` and would slip past the
  // min/max comparisons below (e.g. `Infinity > max` is true but `-Infinity <
  // min` is also true, and either way the value is not a usable setting).
  // Reject non-finite numbers explicitly; NaN is already caught by checkType.
  if (!Number.isFinite(value)) {
    return {
      code: "settings.range.invalid",
      message: `Value ${value} is not a finite number.`,
      severity: "error",
      path: def.key
    };
  }

  if (def.min !== undefined && value < def.min) {
    return {
      code: "settings.range.invalid",
      message: `Value ${value} is below the minimum of ${def.min}.`,
      severity: "error",
      path: def.key
    };
  }
  if (def.max !== undefined && value > def.max) {
    return {
      code: "settings.range.invalid",
      message: `Value ${value} is above the maximum of ${def.max}.`,
      severity: "error",
      path: def.key
    };
  }
  return undefined;
}

/** Verifies an enum value is one of the declared `options`. */
function checkEnum(
  def: SettingDefinition,
  value: unknown
): SettingsDiagnostic | undefined {
  if (def.type !== "enum") return undefined;

  // An enum with no declared options is a schema error: any string would
  // otherwise be silently accepted. Fail loudly so the misconfiguration is
  // surfaced rather than masked.
  if (!def.options) {
    return {
      code: "settings.enum.no_options",
      message: "Enum setting has no declared options.",
      severity: "error",
      path: def.key
    };
  }

  if (typeof value !== "string") return undefined; // already flagged by checkType

  if (!def.options.includes(value)) {
    return {
      code: "settings.enum.invalid",
      message: `Value "${value}" is not one of [${def.options.join(", ")}].`,
      severity: "error",
      path: def.key
    };
  }
  return undefined;
}

/** Helper for the common type-mismatch diagnostic. */
function mismatch(
  def: SettingDefinition,
  detail: string
): SettingsDiagnostic {
  return {
    code: "settings.type.mismatch",
    message: detail,
    severity: "error",
    path: def.key
  };
}
