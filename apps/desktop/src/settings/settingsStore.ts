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
  appearanceModule,
  createSettingsRegistry,
  editorModule,
  settingsModule,
  validateSettings,
  type SettingsDiagnostic,
  type SettingsRegistry
} from "@thinkbrain/core";
import {
  parseDynamicAppSettings,
  serializeDynamicAppSettings
} from "@thinkbrain/core";
import { scheduleAutosave } from "./autosaveScheduler";
import {
  parseDynamicWorkspaceSettings,
  serializeDynamicWorkspaceSettings
} from "./workspaceSettingsSerialization";
import {
  computeDirty,
  effectiveSettingValue,
  partitionByScope
} from "./settingsHelpers";

// ---------------------------------------------------------------------------
// Registry instance with built-in modules registered.
// ---------------------------------------------------------------------------

/**
 * Module-scoped registry with the built-in Appearance, Editor, and Settings
 * modules.
 *
 * Exported so UI components (Story 3+) can look up definitions, sections, and
 * modules for rendering. Extensions will register additional modules here in a
 * follow-up story.
 */
export const appSettingsRegistry: SettingsRegistry = createSettingsRegistry();
appSettingsRegistry.register(appearanceModule);
appSettingsRegistry.register(editorModule);
appSettingsRegistry.register(settingsModule);

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
   * A document rather than a payload: `update_desktop_state` and
   * `update_app_theme` write to the same file on every tab open, panel resize,
   * or theme change, so this store has to serialize against the document as it
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
  /**
   * Stages a single setting and saves immediately.
   *
   * Used by palette commands, where there is no Save bar to press. Any other
   * staged edits are persisted alongside it — acceptable because the Settings
   * tab and the palette are not usually driven at the same time.
   */
  setSettingImmediately(key: string, value: unknown): Promise<void>;
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
     *
     * When `settings.autosave` is enabled (effective value), schedules a
     * debounced save via {@link scheduleAutosave} so changes persist without an
     * explicit Save click. A just-staged autosave toggle itself triggers
     * autosave (saving its own enablement).
     */
    stageChange(key: string, value: unknown): void {
      const staged = { ...get().stagedChanges, [key]: value };
      const dirty = computeDirty(staged);
      // Clear any existing validation diagnostic for this key.
      const remainingDiagnostics = get().validationDiagnostics.filter(
        (d) => d.path !== key
      );
      set({ stagedChanges: staged, ...dirty, validationDiagnostics: remainingDiagnostics });

      // Effective autosave flag: staged > appValues > default. The special-case
      // for `settings.autosave` itself makes a just-staged enable toggle fire.
      const autosaveEnabled = key === "settings.autosave"
        ? value === true
        : (get().stagedChanges["settings.autosave"] ?? get().appValues["settings.autosave"] ?? false);
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
      const { app: appStaged, workspace: workspaceStaged } = partitionByScope(appSettingsRegistry, staged);

      // Build the full effective values map for validation: merge loaded values
      // with staged changes so validators see the complete picture.
      const appEffective = { ...state.appValues, ...appStaged };
      const workspaceEffective = { ...(state.workspaceValues ?? {}), ...workspaceStaged };

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
            serializeDynamicAppSettings(values, appSettingsRegistry, current)
          );
        }
        let workspaceSerialized: string | null = null;
        if (workspaceMerged !== null && state.workspaceRootPath !== null) {
          workspaceSerialized = await gateway.writeWorkspaceSettings(
            state.workspaceRootPath,
            (current) =>
              serializeDynamicWorkspaceSettings(workspaceMerged, appSettingsRegistry, current)
          );
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
        const remainingCount = Object.keys(remaining).length;

        const next: Partial<SettingsStoreState> = {
          stagedChanges: remaining,
          isDirty: remainingCount > 0,
          dirtyCount: remainingCount,
          validationDiagnostics: [],
          saveError: null
        };
        if (appMerged !== null && appSerialized !== null) {
          next.appValues = appMerged;
          next.rawAppSettingsJson = appSerialized;
        }
        if (workspaceMerged !== null && workspaceSerialized !== null) {
          next.workspaceValues = workspaceMerged;
          next.rawWorkspaceSettingsJson = workspaceSerialized;
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
      return effectiveSettingValue(get(), appSettingsRegistry.getDefinition(key), key);
    },

    async setSettingImmediately(key: string, value: unknown): Promise<void> {
      get().stageChange(key, value);
      const result = await get().saveSettings();
      if (!result.success) {
        console.error(`[settingsStore] Failed to persist "${key}".`, result.diagnostics);
      }
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
