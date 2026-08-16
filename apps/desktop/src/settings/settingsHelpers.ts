import type {
  SettingDefinition,
  SettingsRegistry,
  SettingScope
} from "@thinkbrain/core";
import type { SettingsStoreState } from "./settingsStore";

/**
 * The single source of truth for effective-value precedence.
 *
 * Resolution order: staged > workspace (only for `scope: "workspace"` keys) >
 * app > definition default. A workspace override only outranks the app value
 * for a setting that declares `scope: "workspace"`. Workspace settings travel
 * with a vault, so a file that names an app-scoped key must not be able to
 * reach across scopes and change how the app behaves everywhere.
 *
 * This is a pure function over its inputs — no store, registry, or React
 * dependency — so it can be shared by the store action, the settings UI, and
 * the extension settings API without any of them drifting. Falsy values
 * (`false`, `0`, `""`) are honored at each layer: presence is checked via
 * `in`, not truthiness, so a staged `false` is not replaced by a saved `true`.
 *
 * Args:
 *   key: The full setting key (e.g. `"appearance.theme"`).
 *   staged: Pending changes map. A key present here wins outright.
 *   appValues: Loaded app-scoped values (defaults already merged in by the
 *     store's loader).
 *   workspaceValues: Loaded workspace-scoped values, or `null` when no
 *     workspace is open. Only consulted for `scope: "workspace"` keys.
 *   definition: The setting's registry definition, used for its `scope` and
 *     `default`. May be `undefined` for an unknown key, in which case the
 *     default is `undefined`.
 *
 * Returns:
 *   The effective value, or `undefined` when the key is unknown and absent
 *   from every layer.
 */
export function resolveEffectiveValue(
  key: string,
  staged: Record<string, unknown>,
  appValues: Record<string, unknown>,
  workspaceValues: Record<string, unknown> | null,
  definition: SettingDefinition | undefined
): unknown {
  if (key in staged) return staged[key];
  if (
    definition?.scope === "workspace" &&
    workspaceValues !== null &&
    key in workspaceValues
  ) {
    return workspaceValues[key];
  }
  if (key in appValues) return appValues[key];
  return definition?.default;
}

/**
 * Store-state adapter around {@link resolveEffectiveValue}.
 *
 * Exported so the extension settings API resolves values the same way
 * the settings UI does; two copies of this rule would drift. Prefer calling
 * {@link resolveEffectiveValue} directly when you already hold the raw maps.
 */
export function effectiveSettingValue(
  state: Pick<SettingsStoreState, "stagedChanges" | "appValues" | "workspaceValues">,
  definition: SettingDefinition | undefined,
  key: string
): unknown {
  return resolveEffectiveValue(
    key,
    state.stagedChanges,
    state.appValues,
    state.workspaceValues,
    definition
  );
}

/**
 * Returns the scope of a setting key from the registry, or undefined if the key
 * is unknown.
 */
function scopeOfKey(registry: SettingsRegistry, key: string): SettingScope | undefined {
  return registry.getDefinition(key)?.scope;
}

/**
 * Partitions a set of setting entries into app-scoped and workspace-scoped
 * buckets based on the registry. Keys whose scope is not "workspace" (including
 * unknown keys) are routed to the app bucket.
 */
export function partitionByScope(
  registry: SettingsRegistry,
  entries: Record<string, unknown>
): { app: Record<string, unknown>; workspace: Record<string, unknown> } {
  const app: Record<string, unknown> = {};
  const workspace: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entries)) {
    if (scopeOfKey(registry, key) === "workspace") {
      workspace[key] = value;
    } else {
      app[key] = value;
    }
  }
  return { app, workspace };
}

/**
 * Computes the dirty flag and count from the staged changes map.
 */
export function computeDirty(staged: Record<string, unknown>): {
  isDirty: boolean;
  dirtyCount: number;
} {
  const keys = Object.keys(staged);
  return { isDirty: keys.length > 0, dirtyCount: keys.length };
}
