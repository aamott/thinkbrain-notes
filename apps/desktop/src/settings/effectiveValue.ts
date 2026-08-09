/**
 * Computes the effective value for a setting key from the raw store fields.
 *
 * Resolution order: staged > appValues > workspaceValues > definition default.
 * This mirrors `SettingsStoreState.getEffectiveValue` but is computed inline
 * during render so React re-renders when the selected fields change.
 */
export function computeEffectiveValue(
  key: string,
  defaultValue: unknown,
  staged: Record<string, unknown>,
  appValues: Record<string, unknown>,
  workspaceValues: Record<string, unknown> | null
): unknown {
  if (key in staged) return staged[key];
  if (key in appValues) return appValues[key];
  if (workspaceValues && key in workspaceValues) return workspaceValues[key];
  return defaultValue;
}
