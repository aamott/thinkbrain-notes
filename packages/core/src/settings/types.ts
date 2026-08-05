/**
 * Platform-agnostic type system for the modular settings architecture.
 *
 * Definitions are pure data: no React, DOM, Node, or Tauri imports. A
 * `SettingsModule` is a self-contained schema (sections -> settings) that the
 * registry collects. Keys are relative within a module; the registry composes
 * the full key as `moduleId.key` so module IDs act as a namespace.
 */

/** Primitive value kinds a setting can hold. */
export type SettingType = "boolean" | "string" | "number" | "enum" | "path";

/** Top-level grouping. UI renders app and workspace settings as separate nav. */
export type SettingScope = "app" | "workspace";

/**
 * Declarative schema for a single setting.
 *
 * `key` is relative to its module (e.g. `"fontSize"`); the registry resolves it
 * to the full `moduleId.key` form. `portable` defaults to `true` for all types
 * except `path`, which defaults to `false` (paths are machine-specific).
 */
export interface SettingDefinition {
  /** Relative key within the owning module (e.g. `"fontSize"`). */
  readonly key: string;
  readonly type: SettingType;
  readonly label: string;
  readonly description: string;
  /** Default value used when a setting is absent. */
  readonly default: unknown;
  readonly scope: SettingScope;
  /** Section id this setting belongs to (e.g. `"editor.display"`). */
  readonly section: string;
  /**
   * Custom validator returning an error message, or `null` when valid. Run in
   * addition to the registry's built-in type/range/enum checks.
   */
  readonly validation?: (value: unknown) => string | null;
  /** Maps to a registered custom control component; standard types auto-render. */
  readonly control?: string;
  /** Whether the value is safe to export/import across machines. */
  readonly portable?: boolean;
  /** Inclusive lower bound for `number` settings. */
  readonly min?: number;
  /** Inclusive upper bound for `number` settings. */
  readonly max?: number;
  /** Allowed values for `enum` settings. */
  readonly options?: readonly string[];
}

/**
 * A group of settings within a module. Sections may nest recursively via
 * `subsections`; the leaf `settings` array holds the actual definitions.
 */
export interface SettingSection {
  readonly id: string;
  readonly label: string;
  readonly settings?: readonly SettingDefinition[];
  readonly subsections?: readonly SettingSection[];
}

/**
 * A self-contained settings schema contributed by the app or an extension.
 *
 * All settings in a module share the module's `scope`. The registry enforces
 * module ID uniqueness so namespaces never collide.
 */
export interface SettingsModule {
  readonly id: string;
  readonly label: string;
  readonly scope: SettingScope;
  readonly sections: readonly SettingSection[];
  readonly description?: string;
}

/**
 * A single version-to-version migration step. The registry collects these
 * centrally; the persistence layer applies them in order during parsing.
 */
export interface SettingMigration {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly migrate: (
    value: Readonly<Record<string, unknown>>
  ) => Record<string, unknown>;
}
