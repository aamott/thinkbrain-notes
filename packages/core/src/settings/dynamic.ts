/**
 * Dynamic settings persistence (registry-backed key-value model).
 *
 * These functions operate on a flat `fullKey -> value` record driven by the
 * registry, while preserving the `desktopState` nested key and any other
 * non-setting keys in the same JSON document.
 */

import type { SettingsRegistry } from "./registry";
import { extractDefaults } from "./defaults";
import { validateSettings } from "./validation";
import type { SettingsDiagnostic } from "./internal";
import type { SettingScope } from "./types";
import {
  CURRENT_SETTINGS_VERSION,
  getErrorMessage,
  isRecord,
  readSettingsVersion
} from "./internal";

/** Result of parsing the dynamic app settings document. */
export interface ParseDynamicAppSettingsResult {
  /** Flat `fullKey -> value` map of app-scoped settings (defaults merged in). */
  readonly values: Record<string, unknown>;
  /** Diagnostics for invalid JSON or bad shape. */
  readonly diagnostics: SettingsDiagnostic[];
}

/** Builds a defaults-fallback result with a single diagnostic. */
const defaultsFailure = (
  defaults: Record<string, unknown>,
  code: string,
  message: string,
  severity: SettingsDiagnostic["severity"]
): ParseDynamicAppSettingsResult => ({
  values: defaults,
  diagnostics: [{ code, message, severity }]
});

/**
 * Parses raw app settings JSON into a flat, registry-backed key-value map.
 *
 * The raw document may contain a mix of dynamic setting keys (e.g.
 * `appearance.theme`, `editor.fontSize`), the `desktopState` nested object
 * (shell layout state, NOT a setting), and a `version` field. This function:
 *   1. Parses the JSON (or returns defaults + a diagnostic on failure).
 *   2. Reads and validates the document's `version` field.
 *   3. Extracts only the keys known to the registry as app-scoped settings.
 *   4. Merges with `extractDefaults(registry, "app")` so missing keys get
 *      defaults.
 *   5. Ignores unknown keys (stale/misspelled keys are silently dropped).
 *
 * The `desktopState` nested key is never treated as a setting; it is preserved
 * in the raw document and handled separately by `desktopState.ts`.
 *
 * Args:
 *   rawJson: Raw JSON from `read_app_settings`, or null if the file is absent.
 *   registry: The settings registry providing definitions.
 *
 * Returns:
 *   A flat key-value map of app-scoped settings (defaults merged) plus
 *   diagnostics for any parse/shape problems.
 */
export function parseDynamicAppSettings(
  rawJson: string | null,
  registry: SettingsRegistry
): ParseDynamicAppSettingsResult {
  const defaults = extractDefaults(registry, "app");

  if (rawJson === null) {
    return defaultsFailure(
      defaults,
      "settings.missing",
      "Application settings file was not found; defaults were used.",
      "warning"
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson) as unknown;
  } catch (error) {
    return defaultsFailure(
      defaults,
      "settings.invalid_json",
      `Application settings JSON could not be parsed: ${getErrorMessage(error)}`,
      "error"
    );
  }

  if (!isRecord(parsed)) {
    return defaultsFailure(
      defaults,
      "settings.invalid_shape",
      "Application settings must be a JSON object; defaults were used.",
      "error"
    );
  }

  // Read the version, then extract settings. Only an error gives up on the
  // document: a version this build cannot make sense of at all
  // (`settings.version.invalid`) says nothing about what the rest of it means,
  // while a merely newer one is a warning and the keys below are still read.
  const versionRead = readSettingsVersion(parsed);
  const versionDiagnostics = versionRead.diagnostic ? [versionRead.diagnostic] : [];
  if (versionRead.diagnostic?.severity === "error") {
    return { values: defaults, diagnostics: versionDiagnostics };
  }

  // Extract only known app-scoped keys from the record; unknown keys are
  // ignored so stale/misspelled entries don't leak into the settings model.
  const values = extractScopedValues(parsed, defaults, registry, "app");

  // Validate the merged values against the registry so invalid persisted values
  // (e.g. out-of-range numbers, stale enum strings) surface as diagnostics
  // instead of silently passing through. Validation runs after defaults merge so
  // missing keys (filled by defaults) are not flagged.
  const validationDiagnostics = validateSettings(registry, values);

  return {
    values,
    diagnostics: [...versionDiagnostics, ...validationDiagnostics]
  };
}

/**
 * Serializes dynamic settings for a single scope back to JSON, preserving
 * non-setting keys.
 *
 * The output keeps the document's version (never below
 * `CURRENT_SETTINGS_VERSION`, never lower than it already was), the flat setting
 * keys for the given scope, and any other non-setting keys (e.g. `desktopState`,
 * extension metadata) from `existingRawJson`. Pretty-printed with 2-space
 * indent and a trailing newline, matching the settings serialization style.
 *
 * Args:
 *   values: Flat `fullKey -> value` map of settings to write.
 *   registry: The settings registry (used to identify known setting keys).
 *   scope: Which scope's definitions to include in the known-key set.
 *   existingRawJson: The current raw JSON document (may be null/invalid); its
 *     non-setting keys are preserved.
 *
 * Returns:
 *   Canonical JSON string with settings + preserved non-setting keys.
 */
function serializeDynamicSettings(
  values: Record<string, unknown>,
  registry: SettingsRegistry,
  scope: SettingScope,
  existingRawJson: string | null
): string {
  // Start from the existing raw document (if parseable) to preserve non-setting
  // keys like `desktopState` and any extension-provided keys.
  const base: Record<string, unknown> = {};
  if (existingRawJson !== null) {
    try {
      const parsed: unknown = JSON.parse(existingRawJson);
      if (isRecord(parsed)) {
        Object.assign(base, parsed);
      }
    } catch {
      // Malformed existing JSON: start fresh with just version + settings.
    }
  }

  // Build the known setting key set from the registry so we can remove stale
  // setting keys from the base before writing the new values.
  const knownSettingKeys = new Set<string>();
  for (const def of registry.getAllDefinitions()) {
    if (def.scope === scope) knownSettingKeys.add(def.key);
  }

  // Remove old setting keys from the base (they'll be replaced below), but keep
  // non-setting keys like `desktopState`, `version`, and unknown keys.
  for (const key of Object.keys(base)) {
    if (knownSettingKeys.has(key)) {
      delete base[key];
    }
  }

  // Write the new setting values.
  for (const [key, value] of Object.entries(values)) {
    if (knownSettingKeys.has(key)) {
      base[key] = value;
    }
  }

  // Stamp the current version, but never a lower one than the document already
  // carried: a newer build's marker must survive a round trip through an
  // older one.
  base.version = Math.max(
    readSettingsVersion(base).version,
    CURRENT_SETTINGS_VERSION
  );

  return `${JSON.stringify(base, null, 2)}\n`;
}

/**
 * Serializes dynamic app settings back to JSON, preserving non-setting keys.
 *
 * Thin wrapper over {@link serializeDynamicSettings} for the `"app"` scope.
 */
export function serializeDynamicAppSettings(
  values: Record<string, unknown>,
  registry: SettingsRegistry,
  existingRawJson: string | null
): string {
  return serializeDynamicSettings(values, registry, "app", existingRawJson);
}

/**
 * Parses raw workspace settings JSON into a flat key-value map merged with
 * registry defaults for the workspace scope.
 *
 * Deliberately unlike {@link parseDynamicAppSettings}: workspace documents
 * emit no diagnostics — unknown or invalid values are simply ignored (parse
 * failure or a non-object document yields defaults).
 */
export function parseDynamicWorkspaceSettings(
  rawJson: string | null,
  registry: SettingsRegistry
): Record<string, unknown> {
  const defaults = extractDefaults(registry, "workspace");

  if (rawJson === null) return defaults;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson) as unknown;
  } catch {
    return defaults;
  }

  if (!isRecord(parsed)) return defaults;

  return extractScopedValues(parsed, defaults, registry, "workspace");
}

/**
 * Serializes workspace settings back to JSON, preserving non-setting keys from
 * the existing raw document (e.g. `version`, extension keys).
 *
 * Thin wrapper over {@link serializeDynamicSettings} for the `"workspace"` scope.
 */
export function serializeDynamicWorkspaceSettings(
  values: Record<string, unknown>,
  registry: SettingsRegistry,
  existingRawJson: string | null
): string {
  return serializeDynamicSettings(values, registry, "workspace", existingRawJson);
}

/**
 * Extracts only the keys known to the registry as `scope` settings, merged over
 * that scope's defaults. Unknown keys are ignored so stale/misspelled entries
 * don't leak into the settings model.
 */
function extractScopedValues(
  record: Record<string, unknown>,
  defaults: Record<string, unknown>,
  registry: SettingsRegistry,
  scope: SettingScope
): Record<string, unknown> {
  const values: Record<string, unknown> = { ...defaults };
  for (const def of registry.getAllDefinitions()) {
    // Scope is a property of the setting, not of the module it arrived in: an
    // app-scoped module may hold a per-workspace setting, and that setting must
    // not travel in the app file (D45).
    if (def.scope !== scope) continue;
    if (def.key in record) {
      values[def.key] = record[def.key];
    }
  }
  return values;
}
