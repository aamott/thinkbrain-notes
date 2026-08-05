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
  // A future version (> CURRENT_SETTINGS_VERSION) is rejected up front with
  // defaults + an error diagnostic, mirroring the legacy `readSettingsVersion`
  // strict check. Skipped migration steps emit warning diagnostics that are
  // surfaced alongside the parse result.
  const versionRead = readDynamicSettingsVersion(parsed);
  if (versionRead.diagnostic) {
    return {
      values: defaults,
      diagnostics: [versionRead.diagnostic]
    };
  }

  let record: Record<string, unknown>;
  let migrationDiagnostics: SettingsDiagnostic[];
  try {
    const migrated = migrateDynamicSettingsObject(parsed, registry);
    record = migrated.record;
    migrationDiagnostics = migrated.diagnostics;
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

  return { values, diagnostics: migrationDiagnostics };
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
 * Unlike the legacy strict check, the dynamic system tolerates gaps in
 * migration chains (e.g. from extensions): when a step's `fromVersion` does
 * not match the record's current version, the step is skipped and a warning
 * diagnostic is emitted rather than throwing. The caller decides whether to
 * surface those warnings.
 *
 * Args:
 *   record: The parsed raw settings record (mutated copy returned).
 *   registry: The settings registry providing the migration list.
 *
 * Returns:
 *   An object with the migrated record (with `version` set to the current
 *   settings version) and a list of warning diagnostics for any skipped
 *   migration steps.
 */
function migrateDynamicSettingsObject(
  record: Readonly<Record<string, unknown>>,
  registry: SettingsRegistry
): { record: Record<string, unknown>; diagnostics: SettingsDiagnostic[] } {
  const fromVersion = readDynamicSettingsVersion(record).version;
  let value: Record<string, unknown> = { ...record };
  const diagnostics: SettingsDiagnostic[] = [];

  const migrations = [...registry.getMigrations()].sort(
    (a, b) => a.fromVersion - b.fromVersion
  );

  for (const step of migrations) {
    if (step.fromVersion < fromVersion) continue;
    const currentVersion = readDynamicSettingsVersion(value).version;
    if (currentVersion !== step.fromVersion) {
      // Skip if the record's version doesn't match this step's expected source.
      // This is lenient compared to the legacy strict check, but the dynamic
      // system may have gaps in migration chains from extensions. Emit a
      // warning so the skip is observable rather than silent.
      diagnostics.push({
        code: "settings.migration_skipped",
        message: `Migration step from version ${step.fromVersion} to ${step.toVersion} was skipped; record version is ${currentVersion}.`,
        severity: "warning",
        path: "version"
      });
      continue;
    }
    value = step.migrate(value);
    value.version = step.toVersion;
  }

  value.version = CURRENT_SETTINGS_VERSION;
  return { record: value, diagnostics };
}

/**
 * Reads the `version` field from a raw record, defaulting to 0 (unversioned).
 *
 * Mirrors the legacy `readSettingsVersion` strict check: a version newer than
 * `CURRENT_SETTINGS_VERSION` is rejected with an error diagnostic so the caller
 * can fall back to defaults rather than silently "migrating" a future document
 * down to v0. A malformed version (non-integer, negative) yields a
 * `settings.version.invalid` error diagnostic and is treated as v0.
 */
function readDynamicSettingsVersion(
  value: Readonly<Record<string, unknown>>
): { version: number; diagnostic?: SettingsDiagnostic } {
  const version = value.version;

  if (version === undefined) {
    return { version: 0 };
  }

  if (
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    version < 0
  ) {
    return {
      version: 0,
      diagnostic: {
        code: "settings.version.invalid",
        message:
          "Application settings version must be a non-negative integer; defaults were used.",
        severity: "error",
        path: "version"
      }
    };
  }

  if (version > CURRENT_SETTINGS_VERSION) {
    return {
      version,
      diagnostic: {
        code: "settings.version.unsupported",
        message: `Application settings version ${version} is newer than supported version ${CURRENT_SETTINGS_VERSION}; defaults were used.`,
        severity: "error",
        path: "version"
      }
    };
  }

  return { version };
}

/** Type guard for a plain JSON object record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Extracts a human-readable message from an unknown error. */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
