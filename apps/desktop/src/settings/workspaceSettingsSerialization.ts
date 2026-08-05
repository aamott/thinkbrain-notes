/**
 * Workspace dynamic settings parse/serialize helpers.
 *
 * Extracted from `settingsStore.ts` to keep that file under the 500-line
 * guideline. Workspace settings use the same dynamic key-value model as app
 * settings but only include workspace-scoped definitions; unknown keys are
 * ignored on parse and stripped on serialize (while preserving non-setting
 * keys like `version` and extension metadata).
 */

import {
  CURRENT_SETTINGS_VERSION,
  extractDefaults,
  getModuleIdFromKey,
  isRecord,
  type SettingsRegistry
} from "@thinkbrain/core";

/**
 * Parses raw workspace settings JSON into a flat key-value map merged with
 * registry defaults for the workspace scope.
 *
 * Workspace settings use the same dynamic key-value model as app settings but
 * only include workspace-scoped definitions. Unknown keys are ignored.
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

  const values: Record<string, unknown> = { ...defaults };
  for (const def of registry.getAllDefinitions()) {
    const module = registry.getModule(getModuleIdFromKey(def.key));
    if (!module || module.scope !== "workspace") continue;
    if (def.key in parsed) {
      values[def.key] = (parsed as Record<string, unknown>)[def.key];
    }
  }
  return values;
}

/**
 * Serializes workspace settings back to JSON, preserving non-setting keys from
 * the existing raw document (e.g. `version`, extension keys).
 */
export function serializeDynamicWorkspaceSettings(
  values: Record<string, unknown>,
  registry: SettingsRegistry,
  existingRawJson: string | null
): string {
  const base: Record<string, unknown> = {};
  if (existingRawJson !== null) {
    try {
      const parsed: unknown = JSON.parse(existingRawJson);
      if (isRecord(parsed)) Object.assign(base, parsed);
    } catch {
      // Malformed: start fresh.
    }
  }

  const knownSettingKeys = new Set<string>();
  for (const def of registry.getAllDefinitions()) {
    const module = registry.getModule(getModuleIdFromKey(def.key));
    if (module && module.scope === "workspace") {
      knownSettingKeys.add(def.key);
    }
  }

  for (const key of Object.keys(base)) {
    if (knownSettingKeys.has(key)) delete base[key];
  }
  for (const [key, value] of Object.entries(values)) {
    if (knownSettingKeys.has(key)) base[key] = value;
  }
  base.version = CURRENT_SETTINGS_VERSION;

  return `${JSON.stringify(base, null, 2)}\n`;
}
