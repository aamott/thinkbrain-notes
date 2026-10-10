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
import { useSyncExternalStore } from "react";
import { readAppSettingsDocument, updateAppSettingsDocument } from "./appSettingsFile";
import {
  readWorkspaceSettingsDocument,
  updateWorkspaceSettingsDocument
} from "../workspace/workspaceSettingsFile";
import {
  appearanceModule,
  createSettingsRegistry,
  editorModule,
  settingsModule,
  syncModule,
  validateSettings,
  type SettingsDiagnostic,
  type SettingsRegistry
} from "@thinkbrain/core";
import {
  getErrorMessage,
  isRecord,
  parseDynamicAppSettings,
  parseDynamicWorkspaceSettings,
  serializeDynamicAppSettings,
  serializeDynamicWorkspaceSettings,
  type SettingDefinition,
  type SettingScope,
  type SettingsModule
} from "@thinkbrain/core";
import { scheduleAutosave } from "./autosaveScheduler";
import { uiModuleForFormFactor } from "./uiModuleDefaults";
import {
  effectiveSettingValue,
  partitionByScope
} from "./settingsHelpers";

// ---------------------------------------------------------------------------
// Registry instance with built-in modules registered.
// ---------------------------------------------------------------------------

/**
 * Module-scoped registry with the built-in Appearance, Editor, Settings, Sync,
 * and UI modules.
 *
 * Exported so UI components (Story 3+) can look up definitions, sections, and
 * modules for rendering. Extensions will register additional modules here in a
 * follow-up story.
 */
export const appSettingsRegistry: SettingsRegistry = createSettingsRegistry();
appSettingsRegistry.register(appearanceModule);
appSettingsRegistry.register(editorModule);
appSettingsRegistry.register(settingsModule);
appSettingsRegistry.register(syncModule);
appSettingsRegistry.register(uiModuleForFormFactor());

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
  /**
   * Revises the app-settings document and returns what was written.
   *
   * A document rather than a payload: `update_desktop_state` writes to the
   * same file on every tab open or panel resize, so this store has to
   * serialize against the document as it
   * is at the moment of writing rather than the copy it read at load. `revise`
   * runs inside the document's own update chain (see `appSettingsFile.ts`).
   */
  writeAppSettings(revise: (current: string | null) => string): Promise<string>;
  readWorkspaceSettings(rootPath: string): Promise<string | null>;
  /**
   * Revises the workspace document and returns what was written.
   *
   * A document rather than a payload: this store is one of two writers to the
   * file, so it has to serialize against the document as it is at the moment of
   * writing rather than the copy it read when the workspace opened. `revise`
   * runs inside the file's own update chain (see `workspaceSettingsFile.ts`).
   */
  writeWorkspaceSettings(
    rootPath: string,
    revise: (current: string | null) => string
  ): Promise<string>;
}

/** Default gateway backed by native Tauri commands. */
const nativeSettingsGateway: SettingsStoreGateway = {
  readAppSettings: () => readAppSettingsDocument(),
  writeAppSettings: (revise) => updateAppSettingsDocument(revise),
  readWorkspaceSettings: (rootPath) => readWorkspaceSettingsDocument(rootPath),
  writeWorkspaceSettings: (rootPath, revise) =>
    updateWorkspaceSettingsDocument(rootPath, revise)
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

  // --- Staged changes ---
  /** Pending changes keyed by full setting key, not yet persisted. */
  stagedChanges: Record<string, unknown>;

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
  /**
   * Stages a single setting and saves immediately.
   *
   * Used by palette commands, where there is no Save bar to press. Any other
   * staged edits are persisted alongside it — acceptable because the Settings
   * tab and the palette are not usually driven at the same time. Extensions
   * use {@link setSingleSettingImmediately} instead: a timer- or event-driven
   * write must not silently flush user edits.
   */
  setSettingImmediately(key: string, value: unknown): Promise<void>;
  /**
   * Stages a single setting and persists only that key.
   *
   * The scoped counterpart to {@link setSettingImmediately}, used by extension
   * `settings.set` (D81). Unlike the palette path it does not co-persist
   * unrelated staged edits, and an unrelated staged key that fails validation
   * cannot strand the write as a phantom-dirty entry.
   *
   * On failure — a rejected write, an invalid value, or a workspace-scoped key
   * with no workspace open — the value stays staged: the session still honours
   * it and a later `saveSettings()` retries the write.
   */
  setSingleSettingImmediately(key: string, value: unknown): Promise<void>;
}

// ---------------------------------------------------------------------------
// Store factory + default hook.
// ---------------------------------------------------------------------------

/**
 * Creates a Zustand settings store bound to the given gateway.
 *
 * Tests pass a mock gateway; production uses the default native gateway. The
 * store defaults to the module-scoped `appSettingsRegistry`; tests that need a
 * fully isolated store can inject a fresh registry too.
 *
 * Args:
 *   gateway: The I/O gateway for reading/writing settings. Defaults to the
 *     native Tauri command gateway.
 *   registry: The schema registry backing defaults, scopes, validation, and
 *     serialization. Defaults to `appSettingsRegistry`.
 *
 * Returns:
 *   A Zustand store creator (use as a hook in React components).
 */
export function createSettingsStore(
  gateway: SettingsStoreGateway = nativeSettingsGateway,
  registry: SettingsRegistry = appSettingsRegistry
) {
  // Load-generation token used to deduplicate concurrent `loadSettings` calls.
  // Each call increments the counter and captures its own generation; after its
  // awaits complete, it checks whether a newer load has superseded it. If so, the
  // stale load aborts (returns without calling `set()`) so the newer load's
  // state wins. This prevents the ThemeProvider mount-load and SettingsTab
  // mount-load race where the last writer clobbered workspaceValues / stagedChanges.
  // Scoped inside the factory closure so each store instance has its own counter.
  let loadGeneration = 0;

  // The last documents this store read from — or successfully wrote to — the
  // gateway. Kept so a late-registered extension schema can re-extract its
  // persisted keys without a disk round-trip; extraction at load dropped them
  // as unknown (see the registry subscription below the factory).
  let lastLoadedAppDocument: string | null = null;
  let lastLoadedWorkspaceDocument: string | null = null;

  const store = create<SettingsStoreState>((set, get) => ({
    // --- Loaded values ---
    appValues: {},
    workspaceValues: null,
    workspaceRootPath: null,

    // --- Staged changes ---
    stagedChanges: {},

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
        const appResult = parseDynamicAppSettings(rawAppJson, registry);

        let workspaceValues: Record<string, unknown> | null = null;
        let rawWorkspaceJson: string | null = null;
        if (rootPath !== null) {
          rawWorkspaceJson = await gateway.readWorkspaceSettings(rootPath);
          workspaceValues = parseDynamicWorkspaceSettings(rawWorkspaceJson, registry);
        }

        // A newer load superseded us while we were awaiting — abort so we don't
        // clobber the fresher state the newer load will (or already did) set.
        if (myGeneration !== loadGeneration) return;

        lastLoadedAppDocument = rawAppJson;
        lastLoadedWorkspaceDocument = rawWorkspaceJson;

        set({
          appValues: appResult.values,
          workspaceValues,
          workspaceRootPath: rootPath,
          stagedChanges: {},
          loadError: null,
          validationDiagnostics: [],
          loaded: true
        });
      } catch (error) {
        // Only record the error if we're still the latest load; a superseded
        // load's error is not representative of the current state.
        if (myGeneration !== loadGeneration) return;
        const message = getErrorMessage(error);
        console.error("[settingsStore] Failed to load settings:", error);
        set({ loadError: `Failed to load settings: ${message}`, loaded: true });
      }
    },

    /**
     * Stages a setting change (does NOT persist). Recomputes dirty state and
     * clears any validation diagnostic for the changed key.
     *
     * When `settings.autosave` is enabled (effective value), schedules a
     * debounced save via {@link scheduleAutosave} so changes persist without an
     * explicit Save click. A just-staged autosave toggle itself triggers
     * autosave (saving its own enablement).
     */
    stageChange(key: string, value: unknown): void {
      const staged = { ...get().stagedChanges, [key]: value };
      // Clear any existing validation diagnostic for this key.
      const remainingDiagnostics = get().validationDiagnostics.filter(
        (d) => d.path !== key
      );
      set({ stagedChanges: staged, validationDiagnostics: remainingDiagnostics });

      // The just-staged `settings.autosave` edit is already in stagedChanges,
      // so the effective value answers "is autosave on" without special-casing.
      const autosaveEnabled = get().getEffectiveValue("settings.autosave") === true;
      if (autosaveEnabled && Object.keys(staged).length > 0) {
        scheduleAutosave(() => get().saveSettings());
      }
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

      // Partition staged changes by scope once; reused for validation and writes.
      const { app: appStaged, workspace: workspaceStaged } = partitionByScope(registry, staged);

      // Build the full effective values map for validation: merge loaded values
      // with staged changes so validators see the complete picture.
      const appEffective = { ...state.appValues, ...appStaged };
      const workspaceEffective = { ...(state.workspaceValues ?? {}), ...workspaceStaged };

      // Validate all effective values (both scopes).
      const diagnostics = validateSettings(registry, {
        ...appEffective,
        ...workspaceEffective
      });

      if (diagnostics.length > 0) {
        set({ validationDiagnostics: diagnostics });
        return { success: false, diagnostics };
      }

      try {

        // Compute the merged *values* up front — they depend only on staged
        // changes and loaded values, not on disk, so a failure of either write
        // still leaves the store consistent with the last-known-good state
        // (the disk may be partially updated, but stagedChanges / loaded
        // values stay intact and the user can retry). This avoids the
        // partial-commit inconsistency where the app write succeeded and
        // `appValues` was updated but `stagedChanges` was never cleared
        // because the workspace write threw afterwards.
        //
        // Neither document's *serialization* can be prepared this far ahead,
        // though: `desktopState` (app) and the explorer's keys (workspace)
        // have writers outside this store, so each has to serialize against
        // whatever is on disk when its write actually runs rather than the
        // copy read at load or workspace-open. Serialization therefore
        // happens inside each write, and `appSerialized` / `workspaceSerialized`
        // are what landed.
        const appMerged: Record<string, unknown> | null =
          Object.keys(appStaged).length > 0 ? { ...state.appValues, ...appStaged } : null;
        const workspaceMerged: Record<string, unknown> | null =
          Object.keys(workspaceStaged).length > 0 && state.workspaceRootPath !== null
            ? { ...(state.workspaceValues ?? {}), ...workspaceStaged }
            : null;

        // Issue both gateway writes first. If either throws, we skip ALL
        // `set()` calls below and surface a clear saveError to the caller.
        let appSerialized: string | null = null;
        if (appMerged !== null) {
          const values = appMerged;
          appSerialized = await gateway.writeAppSettings((current) =>
            serializeDynamicAppSettings(values, registry, current)
          );
          lastLoadedAppDocument = appSerialized;
        }
        let workspaceSerialized: string | null = null;
        if (workspaceMerged !== null && state.workspaceRootPath !== null) {
          workspaceSerialized = await gateway.writeWorkspaceSettings(
            state.workspaceRootPath,
            (current) =>
              serializeDynamicWorkspaceSettings(workspaceMerged, registry, current)
          );
          lastLoadedWorkspaceDocument = workspaceSerialized;
        }

        // Both writes succeeded — now commit the new state atomically.
        //
        // Clear only the keys this save actually persisted, at the value it
        // persisted. Edits staged while the gateway writes were in flight are
        // not covered by those writes, so blanking `stagedChanges` wholesale
        // would drop them silently and leave `isDirty` false, hiding the loss.
        // A key re-staged mid-flight with a different value keeps its new value.
        //
        // A workspace-scoped edit made with no workspace open has nowhere to go:
        // it stays staged rather than being cleared, so the value survives until
        // a workspace opens instead of vanishing on a "successful" save. It is
        // also reported as a failure below — a Save that persists nothing and
        // says it worked leaves the user pressing a button that does nothing.
        const persisted = new Set<string>([
          ...(appSerialized !== null ? Object.keys(appStaged) : []),
          ...(workspaceSerialized !== null ? Object.keys(workspaceStaged) : [])
        ]);
        const remaining = { ...get().stagedChanges };
        for (const [key, savedValue] of Object.entries(staged)) {
          if (persisted.has(key) && key in remaining && Object.is(remaining[key], savedValue)) {
            delete remaining[key];
          }
        }

        const next: Partial<SettingsStoreState> = {
          stagedChanges: remaining,
          validationDiagnostics: [],
          saveError: null
        };
        if (appMerged !== null && appSerialized !== null) {
          next.appValues = appMerged;
        }
        if (workspaceMerged !== null && workspaceSerialized !== null) {
          next.workspaceValues = workspaceMerged;
        }
        const stranded = Object.keys(workspaceStaged).filter((key) => !persisted.has(key));
        if (stranded.length > 0) {
          set({
            ...next,
            saveError:
              "These settings belong to a workspace, and no workspace is open. Open one to save them."
          });
          return { success: false, diagnostics: [] };
        }

        set(next);
        return { success: true, diagnostics: [] };
      } catch (error) {
        // Either gateway write failed. Do NOT commit any in-memory state: the
        // store stays consistent with the last-known-good values, and the
        // stagedChanges remain so the user can retry. The disk may be in a
        // partial state (e.g. app settings written but workspace not), but
        // that will be reconciled on the next successful save or reload.
        const message = getErrorMessage(error);
        console.error("[settingsStore] Failed to save settings:", error);
        set({ saveError: `Failed to save settings: ${message}` });
        return { success: false, diagnostics: [] };
      }
    },

    /**
     * Reverts all staged changes to the last-saved values.
     */
    resetStaged(): void {
      set({ stagedChanges: {}, validationDiagnostics: [] });
    },

    /**
     * Reverts staged changes for settings whose definition belongs to the given
     * section. Uses the registry to find which full keys belong to that section.
     */
    resetSection(sectionId: string): void {
      const sectionDefs = registry.getDefinitionsForSection(sectionId);
      const sectionKeys = new Set(sectionDefs.map((d) => d.key));
      const staged = { ...get().stagedChanges };
      for (const key of sectionKeys) {
        delete staged[key];
      }
      set({ stagedChanges: staged });
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
      return effectiveSettingValue(get(), registry.getDefinition(key), key);
    },

    async setSettingImmediately(key: string, value: unknown): Promise<void> {
      get().stageChange(key, value);
      const result = await get().saveSettings();
      if (!result.success) {
        console.error(`[settingsStore] Failed to persist "${key}".`, result.diagnostics);
      }
    },

    async setSingleSettingImmediately(key: string, value: unknown): Promise<void> {
      get().stageChange(key, value);

      const definition = registry.getDefinition(key);
      if (!definition) {
        // The key cannot be serialized (unknown keys are dropped on write), so
        // persisting would report success while storing nothing.
        console.error(`[settingsStore] Refusing to persist unregistered setting "${key}".`);
        return;
      }
      // Validate only this key: an unrelated staged value that fails
      // validation must not strand the write the way `saveSettings()` would.
      const diagnostics = validateSettings(registry, { [key]: value });
      if (diagnostics.length > 0) {
        const others = get().validationDiagnostics.filter((d) => d.path !== key);
        set({ validationDiagnostics: [...others, ...diagnostics] });
        console.error(`[settingsStore] Refusing to persist invalid value for "${key}".`, diagnostics);
        return;
      }

      const scope = definition.scope === "workspace" ? "workspace" : "app";
      try {
        let merged: Record<string, unknown>;
        if (scope === "workspace") {
          const { workspaceRootPath } = get();
          if (workspaceRootPath === null) {
            // Nowhere to persist yet. The staged value is still honoured for
            // the session and a later save writes it once a workspace opens.
            return;
          }
          merged = { ...(get().workspaceValues ?? {}), [key]: value };
          lastLoadedWorkspaceDocument = await gateway.writeWorkspaceSettings(
            workspaceRootPath,
            (current) => serializeDynamicWorkspaceSettings(merged, registry, current)
          );
        } else {
          merged = { ...get().appValues, [key]: value };
          lastLoadedAppDocument = await gateway.writeAppSettings(
            (current) => serializeDynamicAppSettings(merged, registry, current)
          );
        }

        // Clear the staged key only if nothing re-staged it mid-write, then
        // update the loaded layer so effective-value reads see what persisted.
        const remaining = { ...get().stagedChanges };
        if (Object.is(remaining[key], value)) delete remaining[key];
        set(
          scope === "workspace"
            ? { stagedChanges: remaining, workspaceValues: merged, saveError: null }
            : { stagedChanges: remaining, appValues: merged, saveError: null }
        );
      } catch (error) {
        // Keep the staged entry: the session honours the value and a later
        // save retries the write — the same contract `saveSettings()` gives.
        console.error(`[settingsStore] Failed to persist "${key}":`, error);
      }
    }
  }));

  /**
   * Merges persisted values for keys that were unknown at load time.
   *
   * `loadSettings` drops keys with no registered definition — which is every
   * `extension-*` key whose extension has not activated yet. When a schema
   * registers later (lazily-activated extensions), this re-reads the last
   * loaded documents and fills in the now-known keys. Keys already present —
   * loaded earlier, or written in-session — are left alone, so a schema
   * registration never clobbers user edits.
   */
  const mergePersistedValues = (): void => {
    const state = store.getState();
    if (!state.loaded) return;

    const mergeScope = (
      rawJson: string | null,
      current: Record<string, unknown> | null,
      scope: SettingScope
    ): Record<string, unknown> | null => {
      if (current === null) return null;
      let document: Record<string, unknown> | null = null;
      if (rawJson !== null) {
        try {
          const parsed: unknown = JSON.parse(rawJson);
          if (isRecord(parsed)) document = parsed;
        } catch {
          // A document this store already handled cannot have become malformed
          // in its hands; a corrupt one simply has nothing to merge.
        }
      }
      let next: Record<string, unknown> | null = null;
      for (const def of registry.getAllDefinitions()) {
        if (def.scope !== scope || def.key in current) continue;
        next ??= { ...current };
        next[def.key] =
          document !== null && def.key in document ? document[def.key] : def.default;
      }
      return next;
    };

    const appValues = mergeScope(lastLoadedAppDocument, state.appValues, "app");
    const workspaceValues = mergeScope(
      lastLoadedWorkspaceDocument,
      state.workspaceValues,
      "workspace"
    );
    if (appValues === null && workspaceValues === null) return;
    store.setState({
      ...(appValues !== null ? { appValues } : {}),
      ...(workspaceValues !== null ? { workspaceValues } : {})
    });
  };

  // A late-registered (extension) schema makes previously-unknown persisted
  // keys visible: merge them now rather than waiting for a reload that may
  // never come this session. `loadSettings` itself cannot re-run — it would
  // discard staged edits.
  registry.subscribe(mergePersistedValues);
  return store;
}

/**
 * Default settings store hook for use in React components.
 *
 * Tests should use `createSettingsStore(mockGateway)` to create an isolated
 * store with a mock gateway.
 */
export const useSettingsStore = createSettingsStore();

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

/** True when there are any staged (unsaved) changes. */
export const selectIsDirty = (state: SettingsStoreState): boolean =>
  Object.keys(state.stagedChanges).length > 0;

/** Count of staged (unsaved) changes. */
export const selectDirtyCount = (state: SettingsStoreState): number =>
  Object.keys(state.stagedChanges).length;
