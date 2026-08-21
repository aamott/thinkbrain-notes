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

/** Maps each setting type to the runtime value it accepts. */
export interface SettingValueByType {
  readonly boolean: boolean;
  readonly string: string;
  readonly number: number;
  readonly enum: string;
  /** `null` is the intentional "no path set" sentinel. */
  readonly path: string | null;
}

/** The runtime value accepted by a particular setting type. */
export type SettingValue<T extends SettingType> = SettingValueByType[T];

/** A readonly array guaranteed to contain at least one value. */
export type NonEmptyReadonlyArray<T> = readonly [T, ...T[]];

/**
 * Fields shared by every declarative setting schema.
 *
 * `key` is relative to its module (e.g. `"fontSize"`); the registry resolves it
 * to the full `moduleId.key` form. `portable` defaults to `true` for all types
 * except `path`, which defaults to `false` (paths are machine-specific).
 */
export interface SettingDefinitionBase {
  /** Relative key within the owning module (e.g. `"fontSize"`). */
  readonly key: string;
  readonly label: string;
  readonly description: string;
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
 * Declarative schema for one particular setting type.
 *
 * The `type` discriminator keeps `default` aligned with the type's runtime
 * value. Enum definitions additionally require a non-empty options tuple.
 */
export type SettingDefinitionFor<T extends SettingType> =
  SettingDefinitionBase & {
    readonly type: T;
    /** Default value used when a setting is absent. */
    readonly default: SettingValue<T>;
  } & (T extends "enum"
    ? { readonly options: NonEmptyReadonlyArray<string> }
    : unknown);

/** Discriminated union of every supported setting definition. */
export type SettingDefinition = {
  readonly [T in SettingType]: SettingDefinitionFor<T>;
}[SettingType];

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
 * Scope is a property of each setting: one module may hold a global default
 * and a per-workspace remote. `scope` on the module is the grouping used when
 * it has no settings yet; `getModulesByScope` otherwise projects the module to
 * the settings that match the requested scope. The registry enforces module
 * ID uniqueness so namespaces never collide.
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
