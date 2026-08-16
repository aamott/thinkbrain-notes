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
  extractDefaults,
  isRecord,
  serializeDynamicSettings,
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
    // Per-setting scope, not per-module: an app-scoped module may still own a
    // setting the user sets separately in each workspace.
    if (def.scope !== "workspace") continue;
    if (def.key in parsed) {
      values[def.key] = (parsed as Record<string, unknown>)[def.key];
    }
  }
  return values;
}

/**
 * Serializes workspace settings back to JSON, preserving non-setting keys from
 * the existing raw document (e.g. `version`, extension keys).
 *
 * Thin wrapper over the shared core {@link serializeDynamicSettings} for the
 * `"workspace"` scope.
 */
export function serializeDynamicWorkspaceSettings(
  values: Record<string, unknown>,
  registry: SettingsRegistry,
  existingRawJson: string | null
): string {
  return serializeDynamicSettings(values, registry, "workspace", existingRawJson);
}
