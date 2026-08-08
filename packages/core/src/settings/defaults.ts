/**
 * Default-value extraction for the modular settings system.
 *
 * Returns a flat `fullKey -> default` map for every definition declaring the
 * given scope. Missing keys are filled by defaults downstream, so only present
 * definitions contribute entries here.
 */

import type { SettingsRegistry } from "./registry";
import type { SettingScope } from "./types";

/**
 * Builds a flat map of default values for all definitions in a scope.
 *
 * Args:
 *   registry: The settings registry to read definitions from.
 *   scope: Which setting scope to extract ("app" or "workspace").
 *
 * Returns:
 *   A `Record<string, unknown>` keyed by full setting key, with each value set
 *   to the definition's `default`.
 */
export function extractDefaults(
  registry: SettingsRegistry,
  scope: SettingScope
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};

  // Scope is a property of the setting, not of the module it arrived in: one
  // extension module can hold a per-workspace folder and a global default view.
  for (const def of registry.getAllDefinitions()) {
    if (def.scope === scope) {
      defaults[def.key] = def.default;
    }
  }
  return defaults;
}
