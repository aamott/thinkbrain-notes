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
import { readAppSettingsDocument, updateAppSettingsDocument } from "./appSettingsFile";
import {
  readWorkspaceSettingsDocument,
  updateWorkspaceSettingsDocument
} from "../workspace/workspaceSettingsFile";
import {
  getErrorMessage,
  isRecord,
  parseDynamicAppSettings,
  parseDynamicWorkspaceSettings,
  serializeDynamicAppSettings,
  serializeDynamicWorkspaceSettings,
  validateSettings,
  type SettingScope,
  type SettingsRegistry
} from "@thinkbrain/core";
import { scheduleAutosave } from "./autosaveScheduler";
import { appSettingsRegistry } from "./settingsRegistry";
import {
  effectiveSettingValue,
  partitionByScope
} from "./settingsHelpers";
import type {
  SaveSettingsResult,
  SettingsStoreGateway,
  SettingsStoreState
} from "./settingsStoreTypes";

// ---------------------------------------------------------------------------
// Gateway: abstraction over native settings I/O (for testability).
// ---------------------------------------------------------------------------

/** Default gateway backed by native Tauri commands. */
const nativeSettingsGateway: SettingsStoreGateway = {
  readAppSettings: () => readAppSettingsDocument(),
  writeAppSettings: (revise) => updateAppSettingsDocument(revise),
  readWorkspaceSettings: (rootPath) => readWorkspaceSettingsDocument(rootPath),
  writeWorkspaceSettings: (rootPath, revise) =>
    updateWorkspaceSettingsDocument(rootPath, revise)
};

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
     * merges with registry defaults, and populates the store.
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
        // `workspaceMerged` is only non-null when a workspace is open, so a
        // non-null merged map already guarantees a non-null root path here.
        if (workspaceMerged !== null) {
          workspaceSerialized = await gateway.writeWorkspaceSettings(
            state.workspaceRootPath!,
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

/** True when there are any staged (unsaved) changes. */
export const selectIsDirty = (state: SettingsStoreState): boolean =>
  Object.keys(state.stagedChanges).length > 0;

/** Count of staged (unsaved) changes. */
export const selectDirtyCount = (state: SettingsStoreState): number =>
  Object.keys(state.stagedChanges).length;
