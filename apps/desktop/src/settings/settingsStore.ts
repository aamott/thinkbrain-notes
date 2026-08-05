/**
 * Zustand store for the modular settings system.
 *
 * Manages loaded app/workspace setting values, staged (pending) changes, dirty
 * state, active section, and search query. Persistence flows through the
 * `SettingsStoreGateway` (defaulting to native Tauri commands) so tests can
 * inject a mock gateway. The store uses the registry from Story 1 to know which
 * keys exist, their defaults, and their scope.
 *
 * Per epic design decision #4 (single Save button), changes are staged in
 * memory and only persisted on `saveSettings()`. `resetStaged()` / 
 * `resetSection()` revert to the last-saved values.
 */

import { create } from "zustand";
import { invokeNativeCommand } from "../native/commands";
import {
  appearanceModule,
  createSettingsRegistry,
  editorModule,
  extractDefaults,
  getModuleIdFromKey,
  isRecord,
  validateSettings,
  type SettingsDiagnostic,
  type SettingsRegistry,
  type SettingScope
} from "@thinkbrain/core";
import {
  parseDynamicAppSettings,
  serializeDynamicAppSettings,
  CURRENT_SETTINGS_VERSION
} from "@thinkbrain/core";

// ---------------------------------------------------------------------------
// Registry instance with built-in modules registered.
// ---------------------------------------------------------------------------

/**
 * Module-scoped registry with the built-in Appearance and Editor modules.
 *
 * Exported so UI components (Story 3+) can look up definitions, sections, and
 * modules for rendering. Extensions will register additional modules here in a
 * follow-up story.
 */
export const appSettingsRegistry: SettingsRegistry = createSettingsRegistry();
appSettingsRegistry.register(appearanceModule);
appSettingsRegistry.register(editorModule);

// ---------------------------------------------------------------------------
// Gateway: abstraction over native settings I/O (for testability).
// ---------------------------------------------------------------------------

/**
 * Gateway interface for reading/writing app and workspace settings.
 *
 * Mirrors the `DesktopStateGateway` pattern from `desktopState.ts`. The default
 * implementation calls native Tauri commands; tests inject a mock.
 */
export interface SettingsStoreGateway {
  readAppSettings(): Promise<string | null>;
  writeAppSettings(contents: string): Promise<void>;
  readWorkspaceSettings(rootPath: string): Promise<string | null>;
  writeWorkspaceSettings(rootPath: string, contents: string): Promise<void>;
}

/** Default gateway backed by native Tauri commands. */
const nativeSettingsGateway: SettingsStoreGateway = {
  readAppSettings: () => invokeNativeCommand("read_app_settings"),
  async writeAppSettings(contents) {
    await invokeNativeCommand("write_app_settings", { contents });
  },
  readWorkspaceSettings: (rootPath) => invokeNativeCommand("read_workspace_settings", { rootPath }),
  async writeWorkspaceSettings(rootPath, contents) {
    await invokeNativeCommand("write_workspace_settings", { rootPath, contents });
  }
};

// ---------------------------------------------------------------------------
// Store types.
// ---------------------------------------------------------------------------

/** Result of a save attempt: either success or validation diagnostics. */
export interface SaveSettingsResult {
  readonly success: boolean;
  readonly diagnostics: SettingsDiagnostic[];
}

/** The full Zustand store state shape (state + actions). */
export interface SettingsStoreState {
  // --- Loaded values ---
  /** App-scoped settings keyed by full setting key (defaults merged). */
  appValues: Record<string, unknown>;
  /** Workspace-scoped settings, or null when no workspace is open. */
  workspaceValues: Record<string, unknown> | null;
  /** The root path of the currently loaded workspace, if any. */
  workspaceRootPath: string | null;
  /** Raw app settings JSON from the last load (for serialize-preserving desktopState). */
  rawAppSettingsJson: string | null;
  /** Raw workspace settings JSON from the last load (for serialize-preserving keys). */
  rawWorkspaceSettingsJson: string | null;

  // --- Staged changes ---
  /** Pending changes keyed by full setting key, not yet persisted. */
  stagedChanges: Record<string, unknown>;
  /** True when there are any staged changes. */
  isDirty: boolean;
  /** Count of staged changes. */
  dirtyCount: number;

  // --- UI state ---
  activeSection: string | null;
  searchQuery: string;

  // --- Errors / validation ---
  loadError: string | null;
  saveError: string | null;
  validationDiagnostics: SettingsDiagnostic[];
  /** True after the first successful or failed load. */
  loaded: boolean;

  // --- Actions ---
  loadSettings(rootPath: string | null): Promise<void>;
  stageChange(key: string, value: unknown): void;
  saveSettings(): Promise<SaveSettingsResult>;
  resetStaged(): void;
  resetSection(sectionId: string): void;
  setActiveSection(id: string | null): void;
  setSearchQuery(query: string): void;
  getEffectiveValue(key: string): unknown;
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

/**
 * Returns the scope of a setting key from the registry, or undefined if the key
 * is unknown.
 */
function scopeOfKey(registry: SettingsRegistry, key: string): SettingScope | undefined {
  return registry.getDefinition(key)?.scope;
}

/**
 * Computes the dirty flag and count from the staged changes map.
 */
function computeDirty(staged: Record<string, unknown>): { isDirty: boolean; dirtyCount: number } {
  const keys = Object.keys(staged);
  return { isDirty: keys.length > 0, dirtyCount: keys.length };
}

/**
 * Parses raw workspace settings JSON into a flat key-value map merged with
 * registry defaults for the workspace scope.
 *
 * Workspace settings use the same dynamic key-value model as app settings but
 * only include workspace-scoped definitions. Unknown keys are ignored.
 */
function parseDynamicWorkspaceSettings(
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
function serializeDynamicWorkspaceSettings(
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

// ---------------------------------------------------------------------------
// Store factory + default hook.
// ---------------------------------------------------------------------------

/**
 * Creates a Zustand settings store bound to the given gateway.
 *
 * Tests pass a mock gateway; production uses the default native gateway. The
 * store always uses the module-scoped `appSettingsRegistry`.
 *
 * Args:
 *   gateway: The I/O gateway for reading/writing settings. Defaults to the
 *     native Tauri command gateway.
 *
 * Returns:
 *   A Zustand store creator (use as a hook in React components).
 */
export function createSettingsStore(gateway: SettingsStoreGateway = nativeSettingsGateway) {
  // Load-generation token used to deduplicate concurrent `loadSettings` calls.
  // Each call increments the counter and captures its own generation; after its
  // awaits complete, it checks whether a newer load has superseded it. If so, the
  // stale load aborts (returns without calling `set()`) so the newer load's
  // state wins. This prevents the ThemeProvider mount-load and SettingsTab
  // mount-load race where the last writer clobbered workspaceValues / stagedChanges.
  // Scoped inside the factory closure so each store instance has its own counter.
  let loadGeneration = 0;

  return create<SettingsStoreState>((set, get) => ({
    // --- Loaded values ---
    appValues: {},
    workspaceValues: null,
    workspaceRootPath: null,
    rawAppSettingsJson: null,
    rawWorkspaceSettingsJson: null,

    // --- Staged changes ---
    stagedChanges: {},
    isDirty: false,
    dirtyCount: 0,

    // --- UI state ---
    activeSection: null,
    searchQuery: "",

    // --- Errors / validation ---
    loadError: null,
    saveError: null,
    validationDiagnostics: [],
    loaded: false,

    // --- Actions ---

    /**
     * Loads app settings (and workspace settings if rootPath is non-null),
     * runs migrations, merges with registry defaults, and populates the store.
     * Clears any prior staged changes and errors. Failures set `loadError`.
     */
    async loadSettings(rootPath: string | null): Promise<void> {
      // Capture this call's generation. A newer `loadSettings` call increments
      // the counter; if our generation is no longer the latest after the awaits,
      // we abort so the newer load's `set()` is the one that wins.
      const myGeneration = ++loadGeneration;
      try {
        const rawAppJson = await gateway.readAppSettings();
        const appResult = parseDynamicAppSettings(rawAppJson, appSettingsRegistry);

        let workspaceValues: Record<string, unknown> | null = null;
        let rawWorkspaceJson: string | null = null;
        if (rootPath !== null) {
          rawWorkspaceJson = await gateway.readWorkspaceSettings(rootPath);
          workspaceValues = parseDynamicWorkspaceSettings(rawWorkspaceJson, appSettingsRegistry);
        }

        // A newer load superseded us while we were awaiting — abort so we don't
        // clobber the fresher state the newer load will (or already did) set.
        if (myGeneration !== loadGeneration) return;

        set({
          appValues: appResult.values,
          workspaceValues,
          workspaceRootPath: rootPath,
          rawAppSettingsJson: rawAppJson,
          rawWorkspaceSettingsJson: rawWorkspaceJson,
          stagedChanges: {},
          isDirty: false,
          dirtyCount: 0,
          loadError: null,
          validationDiagnostics: [],
          loaded: true
        });
      } catch (error) {
        // Only record the error if we're still the latest load; a superseded
        // load's error is not representative of the current state.
        if (myGeneration !== loadGeneration) return;
        const message = error instanceof Error ? error.message : String(error);
        console.error("[settingsStore] Failed to load settings:", error);
        set({ loadError: `Failed to load settings: ${message}`, loaded: true });
      }
    },

    /**
     * Stages a setting change (does NOT persist). Recomputes dirty state and
     * clears any validation diagnostic for the changed key.
     */
    stageChange(key: string, value: unknown): void {
      const staged = { ...get().stagedChanges, [key]: value };
      const dirty = computeDirty(staged);
      // Clear any existing validation diagnostic for this key.
      const remainingDiagnostics = get().validationDiagnostics.filter(
        (d) => d.path !== key
      );
      set({ stagedChanges: staged, ...dirty, validationDiagnostics: remainingDiagnostics });
    },

    /**
     * Validates and persists all staged changes. App-scoped and workspace-scoped
     * changes are written through their respective gateway methods. On success,
     * staged changes are cleared and loaded values are updated. On validation
     * failure, nothing is written and diagnostics are stored.
     */
    async saveSettings(): Promise<SaveSettingsResult> {
      const state = get();
      const staged = state.stagedChanges;

      if (Object.keys(staged).length === 0) {
        return { success: true, diagnostics: [] };
      }

      // Build the full effective values map for validation: merge loaded values
      // with staged changes so validators see the complete picture.
      const appEffective = { ...state.appValues };
      const workspaceEffective = { ...(state.workspaceValues ?? {}) };
      for (const [key, value] of Object.entries(staged)) {
        const scope = scopeOfKey(appSettingsRegistry, key);
        if (scope === "workspace") {
          workspaceEffective[key] = value;
        } else {
          appEffective[key] = value;
        }
      }

      // Validate all effective values (both scopes).
      const diagnostics = validateSettings(appSettingsRegistry, {
        ...appEffective,
        ...workspaceEffective
      });

      if (diagnostics.length > 0) {
        set({ validationDiagnostics: diagnostics });
        return { success: false, diagnostics };
      }

      try {
        // Partition staged changes by scope; only write the scope that has changes.
        const appStaged: Record<string, unknown> = {};
        const workspaceStaged: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(staged)) {
          const scope = scopeOfKey(appSettingsRegistry, key);
          if (scope === "workspace") {
            workspaceStaged[key] = value;
          } else {
            appStaged[key] = value;
          }
        }

        if (Object.keys(appStaged).length > 0) {
          const merged = { ...state.appValues, ...appStaged };
          const serialized = serializeDynamicAppSettings(
            merged,
            appSettingsRegistry,
            state.rawAppSettingsJson
          );
          await gateway.writeAppSettings(serialized);
          set({ appValues: merged, rawAppSettingsJson: serialized });
        }

        if (Object.keys(workspaceStaged).length > 0 && state.workspaceRootPath !== null) {
          const merged = { ...(state.workspaceValues ?? {}), ...workspaceStaged };
          const serialized = serializeDynamicWorkspaceSettings(
            merged,
            appSettingsRegistry,
            state.rawWorkspaceSettingsJson
          );
          await gateway.writeWorkspaceSettings(state.workspaceRootPath, serialized);
          set({ workspaceValues: merged, rawWorkspaceSettingsJson: serialized });
        }

        set({
          stagedChanges: {},
          isDirty: false,
          dirtyCount: 0,
          validationDiagnostics: [],
          saveError: null
        });
        return { success: true, diagnostics: [] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[settingsStore] Failed to save settings:", error);
        set({ saveError: `Failed to save settings: ${message}` });
        return { success: false, diagnostics: [] };
      }
    },

    /**
     * Reverts all staged changes to the last-saved values.
     */
    resetStaged(): void {
      set({ stagedChanges: {}, isDirty: false, dirtyCount: 0, validationDiagnostics: [] });
    },

    /**
     * Reverts staged changes for settings whose definition belongs to the given
     * section. Uses the registry to find which full keys belong to that section.
     */
    resetSection(sectionId: string): void {
      const sectionDefs = appSettingsRegistry.getDefinitionsForSection(sectionId);
      const sectionKeys = new Set(sectionDefs.map((d) => d.key));
      const staged = { ...get().stagedChanges };
      for (const key of sectionKeys) {
        delete staged[key];
      }
      const dirty = computeDirty(staged);
      set({ stagedChanges: staged, ...dirty });
    },

    /**
     * Sets the active nav section (null to deselect).
     */
    setActiveSection(id: string | null): void {
      set({ activeSection: id });
    },

    /**
     * Sets the search query filter text.
     */
    setSearchQuery(query: string): void {
      set({ searchQuery: query });
    },

    /**
     * Returns the effective value for a setting key: staged value if present,
     * else loaded value (app or workspace), else the registry default.
     */
    getEffectiveValue(key: string): unknown {
      const state = get();
      if (key in state.stagedChanges) return state.stagedChanges[key];
      if (key in state.appValues) return state.appValues[key];
      if (state.workspaceValues && key in state.workspaceValues) {
        return state.workspaceValues[key];
      }
      return appSettingsRegistry.getDefinition(key)?.default;
    }
  }));
}

/**
 * Default settings store hook for use in React components.
 *
 * Tests should use `createSettingsStore(mockGateway)` to create an isolated
 * store with a mock gateway.
 */
export const useSettingsStore = createSettingsStore();
