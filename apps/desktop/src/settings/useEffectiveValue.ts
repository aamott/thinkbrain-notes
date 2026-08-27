import { appSettingsRegistry, useSettingsStore } from "./settingsStore";
import { resolveEffectiveValue } from "./settingsHelpers";

/**
 * Returns a setting's effective value and re-renders when any value layer
 * changes.
 *
 * The raw maps are selected separately instead of calling the store's
 * `getEffectiveValue` action because the action reads current state without
 * creating a reactive subscription for the resolved primitive.
 */
export function useEffectiveValue(key: string): unknown {
  const stagedChanges = useSettingsStore((state) => state.stagedChanges);
  const appValues = useSettingsStore((state) => state.appValues);
  const workspaceValues = useSettingsStore((state) => state.workspaceValues);

  return resolveEffectiveValue(
    key,
    stagedChanges,
    appValues,
    workspaceValues,
    appSettingsRegistry.getDefinition(key)
  );
}
