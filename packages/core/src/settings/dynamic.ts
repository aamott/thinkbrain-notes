/**
 * Dynamic settings persistence (registry-backed key-value model).
 *
 * These functions coexist with the legacy fixed-shape API in `../settings.ts`.
 * They operate on a flat `fullKey -> value` record driven by the registry,
 * while preserving the `desktopState` nested key and any other non-setting keys
 * in the same JSON document. The legacy `parseAppSettings` /
 * `serializeAppSettings` / `migrateSettings` remain intact so `desktopState.ts`
 * and existing tests keep working.
 */

import type { SettingsRegistry } from "./registry";
import { extractDefaults } from "./defaults";
import type { SettingsDiagnostic } from "../settings";
import { CURRENT_SETTINGS_VERSION } from "../settings";

/** Result of parsing the dynamic app settings document. */
export interface ParseDynamicAppSettingsResult {
  /** Flat `fullKey -> value` map of app-scoped settings (defaults merged in). */
  readonly values: Record<string, unknown>;
  /** Diagnostics for invalid JSON, bad shape, or migration failures. */
  readonly diagnostics: SettingsDiagnostic[];
}

/**
 * Parses raw app settings JSON into a flat, registry-backed key-value map.
 *
 * The raw document may contain a mix of dynamic setting keys (e.g.
 * `appearance.theme`, `editor.fontSize`), the `desktopState` nested object
 * (shell layout state, NOT a setting), and a `version` field. This function:
 *   1. Parses the JSON (or returns defaults + a diagnostic on failure).
 *   2. Runs registry migrations (version-tracked) on the raw record.
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
 *   registry: The settings registry providing definitions and migrations.
 *
 * Returns:
 *   A flat key-value map of app-scoped settings (defaults merged) plus
 *   diagnostics for any parse/migration/shape problems.
 */
export function parseDynamicAppSettings(
  rawJson: string | null,
  registry: SettingsRegistry
): ParseDynamicAppSettingsResult {
  const defaults = extractDefaults(registry, "app");

  if (rawJson === null) {
    return {
      values: defaults,
      diagnostics: [
        {
          code: "settings.missing",
          message: "Application settings file was not found; defaults were used.",
          severity: "warning"
        }
      ]
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson) as unknown;
  } catch (error) {
    return {
      values: defaults,
      diagnostics: [
        {
          code: "settings.invalid_json",
          message: `Application settings JSON could not be parsed: ${getErrorMessage(error)}`,
          severity: "error"
        }
      ]
    };
  }

  if (!isRecord(parsed)) {
    return {
      values: defaults,
      diagnostics: [
        {
          code: "settings.invalid_shape",
          message: "Application settings must be a JSON object; defaults were used.",
          severity: "error"
        }
      ]
    };
  }

  // Run migrations on the raw record (version-tracked), then extract settings.
  let record: Record<string, unknown>;
  try {
    record = migrateDynamicSettingsObject(parsed, registry);
  } catch (error) {
    return {
      values: defaults,
      diagnostics: [
        {
          code: "settings.migration_failed",
          message: getErrorMessage(error),
          severity: "error"
        }
      ]
    };
  }

  // Extract only known app-scoped keys from the migrated record; unknown keys
  // are ignored so stale/misspelled entries don't leak into the settings model.
  const values: Record<string, unknown> = { ...defaults };
  for (const def of registry.getAllDefinitions()) {
    const module = registry.getModule(def.key.slice(0, def.key.indexOf(".")));
    if (!module || module.scope !== "app") continue;
    if (def.key in record) {
      values[def.key] = record[def.key];
    }
  }

  return { values, diagnostics: [] };
}

/**
 * Serializes dynamic app settings back to JSON, preserving non-setting keys.
 *
 * The output keeps `version: CURRENT_SETTINGS_VERSION`, the flat setting keys,
 * and the nested `desktopState` object (plus any other non-setting keys) from
 * `existingRawJson`. Pretty-printed with 2-space indent and a trailing newline,
 * matching the existing `serializeAppSettings` style.
 *
 * Args:
 *   values: Flat `fullKey -> value` map of app-scoped settings to write.
 *   registry: The settings registry (used to identify known setting keys).
 *   existingRawJson: The current raw JSON document (may be null/invalid); its
 *     `desktopState` and other non-setting keys are preserved.
 *
 * Returns:
 *   Canonical JSON string with settings + preserved non-setting keys.
 */
export function serializeDynamicAppSettings(
  values: Record<string, unknown>,
  registry: SettingsRegistry,
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
    const module = registry.getModule(def.key.slice(0, def.key.indexOf(".")));
    if (module && module.scope === "app") {
      knownSettingKeys.add(def.key);
    }
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

  // Always stamp the current version.
  base.version = CURRENT_SETTINGS_VERSION;

  return `${JSON.stringify(base, null, 2)}\n`;
}

/**
 * Runs registry migrations on a raw settings record in version order.
 *
 * Mirrors the version-tracking pattern from the legacy `migrateSettingsObject`
 * but operates on the flat key-value record using the registry's
 * `getMigrations()` list. Migrations are applied in ascending `fromVersion`
 * order; each step transforms the record and advances the version field. The
 * `desktopState` nested key and other non-setting keys pass through untouched.
 *
 * Args:
 *   record: The parsed raw settings record (mutated copy returned).
 *   registry: The settings registry providing the migration list.
 *
 * Returns:
 *   A new record with migrations applied and `version` set to the current
 *   settings version.
 */
function migrateDynamicSettingsObject(
  record: Readonly<Record<string, unknown>>,
  registry: SettingsRegistry
): Record<string, unknown> {
  const fromVersion = readDynamicSettingsVersion(record);
  let value: Record<string, unknown> = { ...record };

  const migrations = [...registry.getMigrations()].sort(
    (a, b) => a.fromVersion - b.fromVersion
  );

  for (const step of migrations) {
    if (step.fromVersion < fromVersion) continue;
    const currentVersion = readDynamicSettingsVersion(value);
    if (currentVersion !== step.fromVersion) {
      // Skip if the record's version doesn't match this step's expected source.
      // This is lenient compared to the legacy strict check, but the dynamic
      // system may have gaps in migration chains from extensions.
      continue;
    }
    value = step.migrate(value);
    value.version = step.toVersion;
  }

  value.version = CURRENT_SETTINGS_VERSION;
  return value;
}

/**
 * Reads the `version` field from a raw record, defaulting to 0 (unversioned).
 */
function readDynamicSettingsVersion(value: Readonly<Record<string, unknown>>): number {
  return typeof value.version === "number" && Number.isInteger(value.version) && value.version >= 0
    ? value.version
    : 0;
}

/** Type guard for a plain JSON object record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Extracts a human-readable message from an unknown error. */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
