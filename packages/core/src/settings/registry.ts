/**
 * Settings registry: collects modules, composes full keys, and answers lookups.
 *
 * The registry is the single source of truth for the settings schema. It stores
 * a *resolved* copy of each definition with `key` set to the full
 * `moduleId.key` form so consumers never have to re-compose keys themselves.
 * Module IDs are unique namespaces; duplicate registration throws loudly.
 */

import type {
  SettingDefinition,
  SettingMigration,
  SettingsModule,
  SettingScope,
  SettingSection
} from "./types";

/**
 * Internal resolved definition: identical to `SettingDefinition` but with the
 * key guaranteed to be the full `moduleId.key` form and `portable` defaulted.
 */
interface ResolvedDefinition extends SettingDefinition {
  readonly key: string;
  readonly portable: boolean;
}

/** A module plus its flattened, resolved definitions for quick lookup. */
interface RegisteredModule {
  readonly module: SettingsModule;
  /** Full-key -> resolved definition. */
  readonly definitions: Map<string, ResolvedDefinition>;
  /** Section id -> resolved definitions in declaration order. */
  readonly bySection: Map<string, ResolvedDefinition[]>;
}

export interface SettingsRegistry {
  /** Collects a module, composing full keys and enforcing ID uniqueness. */
  register(module: SettingsModule): void;
  /** Collects a migration step. */
  registerMigration(migration: SettingMigration): void;
  getMigrations(): readonly SettingMigration[];
  getModule(id: string): SettingsModule | undefined;
  getAllModules(): readonly SettingsModule[];
  /** Returns the definition with its key resolved to the full `moduleId.key`. */
  getDefinition(fullKey: string): SettingDefinition | undefined;
  /** Returns all definitions (resolved full keys) for a section id. */
  getDefinitionsForSection(sectionId: string): readonly SettingDefinition[];
  getModulesByScope(scope: SettingScope): readonly SettingsModule[];
  /** All resolved definitions across every module, in registration order. */
  getAllDefinitions(): readonly SettingDefinition[];
}

/**
 * Creates a fresh, empty settings registry.
 *
 * Returns a class-backed instance so state stays encapsulated while the
 * `SettingsRegistry` interface keeps the public surface structural.
 */
export function createSettingsRegistry(): SettingsRegistry {
  return new SettingsRegistryImpl();
}

class SettingsRegistryImpl implements SettingsRegistry {
  private readonly modules = new Map<string, RegisteredModule>();
  private readonly moduleOrder: string[] = [];
  private readonly migrations: SettingMigration[] = [];
  /**
   * Global index of section id -> module id that registered it. Used to enforce
   * global uniqueness of section ids across modules at registration time.
   */
  private readonly sectionOwners = new Map<string, string>();

  register(module: SettingsModule): void {
    if (this.modules.has(module.id)) {
      throw new Error(
        `A settings module is already registered for id "${module.id}".`
      );
    }

    const definitions = new Map<string, ResolvedDefinition>();
    const bySection = new Map<string, ResolvedDefinition[]>();

    for (const section of module.sections) {
      this.collectSection(module.id, section, definitions, bySection);
    }

    this.modules.set(module.id, { module, definitions, bySection });
    this.moduleOrder.push(module.id);
  }

  registerMigration(migration: SettingMigration): void {
    // Guard against clearly malformed migration steps at registration time so
    // they fail loudly instead of silently corrupting the migration chain.
    if (migration.fromVersion < 0 || migration.toVersion < 0) {
      throw new Error(
        `Migration versions must be non-negative: fromVersion=${migration.fromVersion}, toVersion=${migration.toVersion}.`
      );
    }
    if (migration.fromVersion >= migration.toVersion) {
      throw new Error(
        `Migration fromVersion (${migration.fromVersion}) must be less than toVersion (${migration.toVersion}).`
      );
    }
    for (const existing of this.migrations) {
      if (existing.fromVersion === migration.fromVersion) {
        throw new Error(
          `A migration from version ${migration.fromVersion} is already registered.`
        );
      }
    }
    this.migrations.push(migration);
  }

  getMigrations(): readonly SettingMigration[] {
    return [...this.migrations];
  }

  getModule(id: string): SettingsModule | undefined {
    return this.modules.get(id)?.module;
  }

  getAllModules(): readonly SettingsModule[] {
    return this.moduleOrder.map((id) => this.modules.get(id)!.module);
  }

  getDefinition(fullKey: string): SettingDefinition | undefined {
    const moduleId = getModuleIdFromKey(fullKey);
    const registered = this.modules.get(moduleId);
    if (!registered) return undefined;
    // The definitions map is keyed by the full `moduleId.key` form.
    return registered.definitions.get(fullKey);
  }

  getDefinitionsForSection(sectionId: string): readonly SettingDefinition[] {
    // Section ids are globally unique by convention (e.g. "editor.display").
    for (const id of this.moduleOrder) {
      const registered = this.modules.get(id)!;
      const defs = registered.bySection.get(sectionId);
      if (defs) return [...defs];
    }
    return [];
  }

  getModulesByScope(scope: SettingScope): readonly SettingsModule[] {
    return this.moduleOrder
      .map((id) => this.modules.get(id)!.module)
      .filter((module) => module.scope === scope);
  }

  getAllDefinitions(): readonly SettingDefinition[] {
    const all: SettingDefinition[] = [];
    for (const id of this.moduleOrder) {
      const registered = this.modules.get(id)!;
      for (const def of registered.definitions.values()) {
        all.push(def);
      }
    }
    return all;
  }

  /**
   * Recursively walks a section (and its subsections), resolving each
   * definition's key to the full `moduleId.key` form and indexing by section.
   */
  private collectSection(
    moduleId: string,
    section: SettingSection,
    definitions: Map<string, ResolvedDefinition>,
    bySection: Map<string, ResolvedDefinition[]>
  ): void {
    if (section.settings) {
      const bucket: ResolvedDefinition[] = [];
      for (const def of section.settings) {
        const resolved = resolveDefinition(moduleId, def);
        if (definitions.has(resolved.key)) {
          throw new Error(
            `Duplicate setting key "${resolved.key}" in module "${moduleId}".`
          );
        }
        definitions.set(resolved.key, resolved);
        bucket.push(resolved);
      }
      if (bucket.length > 0) {
        // Enforce global uniqueness of section ids across modules. A duplicate
        // id from a different module would otherwise silently shadow the first
        // registration in `getDefinitionsForSection`, losing data. Fail loudly.
        const existingOwner = this.sectionOwners.get(section.id);
        if (existingOwner !== undefined && existingOwner !== moduleId) {
          throw new Error(
            `Section id "${section.id}" is already registered by another module.`
          );
        }
        this.sectionOwners.set(section.id, moduleId);
        bySection.set(section.id, bucket);
      }
    }

    if (section.subsections) {
      for (const sub of section.subsections) {
        this.collectSection(moduleId, sub, definitions, bySection);
      }
    }
  }
}

/**
 * Resolves a definition's relative key to the full `moduleId.key` form and
 * applies the `portable` default (`true` except for `path` types).
 */
function resolveDefinition(
  moduleId: string,
  def: SettingDefinition
): ResolvedDefinition {
  return {
    ...def,
    key: `${moduleId}.${def.key}`,
    portable: def.portable ?? def.type !== "path"
  };
}

/**
 * Extracts the module id (the segment before the first dot) from a full key.
 *
 * Returns the full key unchanged when it contains no dot, so callers can safely
 * use this on partially-resolved keys without slicing into an empty string.
 */
export function getModuleIdFromKey(fullKey: string): string {
  const dot = fullKey.indexOf(".");
  return dot === -1 ? fullKey : fullKey.slice(0, dot);
}
