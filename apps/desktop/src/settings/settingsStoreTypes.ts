/**
 * The settings store's public type surface: the gateway it persists through,
 * the result a save reports, and the full store state shape.
 *
 * Separated from `settingsStore.ts` so the persistence/state contracts live
 * apart from the store implementation; nothing here is a runtime value.
 */

import type { SettingsDiagnostic } from "@thinkbrain/core";

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
