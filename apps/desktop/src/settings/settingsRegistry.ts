/**
 * The application settings module registry and its live React snapshots.
 *
 * Kept separate from `settingsStore.ts`: the registry owns which settings
 * exist, their defaults, and their scope, while the store owns loaded/staged
 * values. UI components subscribe here rather than to the store so a schema
 * registered by a lazily-activated extension is visible the moment it lands —
 * no dependency on the store's lifecycle, and no import cycle (this module
 * must not import the store).
 */

import { useSyncExternalStore } from "react";
import {
  appearanceModule,
  createSettingsRegistry,
  editorModule,
  settingsModule,
  syncModule,
  type SettingDefinition,
  type SettingScope,
  type SettingsModule,
  type SettingsRegistry
} from "@thinkbrain/core";
import { uiModuleForFormFactor } from "./uiModuleDefaults";

/**
 * Module-scoped registry with the built-in Appearance, Editor, Settings, Sync,
 * and UI modules.
 *
 * Exported so UI components (Story 3+) can look up definitions, sections, and
 * modules for rendering. Extensions register additional modules here on
 * activation.
 */
export const appSettingsRegistry: SettingsRegistry = createSettingsRegistry();
appSettingsRegistry.register(appearanceModule);
appSettingsRegistry.register(editorModule);
appSettingsRegistry.register(settingsModule);
appSettingsRegistry.register(syncModule);
appSettingsRegistry.register(uiModuleForFormFactor());

/**
 * Module-level subscribe for `useSyncExternalStore`: a stable reference so
 * React does not resubscribe on every render.
 */
const subscribeToSettingsRegistry = (listener: () => void): (() => void) =>
  appSettingsRegistry.subscribe(listener);

/**
 * Live snapshot of the settings modules contributing to one scope.
 *
 * Subscribing is required, not optional: extension schemas register on
 * activation, which routinely happens while the settings tab is open — a
 * one-shot read during render would leave the nav and content showing a
 * module that was never registered (or was already disposed). The registry
 * keeps the returned array referentially stable between changes, so it can
 * serve as the `useSyncExternalStore` snapshot directly.
 */
export function useSettingsModules(scope: SettingScope): readonly SettingsModule[] {
  return useSyncExternalStore(
    subscribeToSettingsRegistry,
    () => appSettingsRegistry.getModulesByScope(scope),
    () => appSettingsRegistry.getModulesByScope(scope)
  );
}

/**
 * Live snapshot of every registered settings module, unprojected.
 *
 * Used by the header-bar breadcrumbs, which resolve a section id across all
 * modules rather than one scope's projection.
 */
export function useAllSettingsModules(): readonly SettingsModule[] {
  return useSyncExternalStore(
    subscribeToSettingsRegistry,
    () => appSettingsRegistry.getAllModules(),
    () => appSettingsRegistry.getAllModules()
  );
}

/**
 * Live snapshot of every resolved setting definition.
 *
 * Used by nav search so a schema registered while settings is open is
 * searchable immediately rather than after the next unrelated re-render.
 */
export function useSettingDefinitions(): readonly SettingDefinition[] {
  return useSyncExternalStore(
    subscribeToSettingsRegistry,
    () => appSettingsRegistry.getAllDefinitions(),
    () => appSettingsRegistry.getAllDefinitions()
  );
}
