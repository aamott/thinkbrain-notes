/**
 * Canonical registry for the platform-agnostic settings schema.
 *
 * Registration order is stable. Each definition is stored with its full
 * `moduleId.key` key, so consumers can use lookup and section APIs without
 * re-composing keys. Duplicate modules, settings, migrations, and conflicting
 * cross-module section IDs fail loudly during registration.
 */

import type { Disposable } from "../lifecycle";
import type {
  SettingDefinition,
  SettingMigration,
  SettingsModule,
  SettingScope,
  SettingSection
} from "./types";
import { assertNeverSettingType } from "./internal";

/**
 * Internal resolved definition: identical to `SettingDefinition` but with the
 * key guaranteed to be the full `moduleId.key` form and `portable` defaulted.
 */
type ResolvedDefinition = SettingDefinition & {
  readonly key: string;
  readonly portable: boolean;
};

/** A module plus its flattened, resolved definitions for quick lookup. */
interface RegisteredModule {
  readonly module: SettingsModule;
  /** Full-key -> resolved definition. */
  readonly definitions: Map<string, ResolvedDefinition>;
  /** Section id -> resolved definitions in declaration order. */
  readonly bySection: Map<string, ResolvedDefinition[]>;
  /** Section IDs claimed by this module, for precise release on disposal. */
  readonly sectionIds: readonly string[];
}

export interface SettingsRegistry {
  /** Registers a module and resolves each relative key into `moduleId.key`. */
  register(module: SettingsModule): Disposable;
  /** Registers one persistence migration, keyed by its source version. */
  registerMigration(migration: SettingMigration): void;
  /** Returns migrations in registration order. */
  getMigrations(): readonly SettingMigration[];
  /** Looks up a module by its stable namespace ID. */
  getModule(id: string): SettingsModule | undefined;
  /** Returns registered modules in registration order. */
  getAllModules(): readonly SettingsModule[];
  /** Returns a resolved definition by its full `moduleId.key` key. */
  getDefinition(fullKey: string): SettingDefinition | undefined;
  /** Returns resolved definitions in declaration order for a section. */
  getDefinitionsForSection(sectionId: string): readonly SettingDefinition[];
  /**
   * Returns modules that contribute settings of the given scope.
   *
   * Each returned module is projected to that scope: mixed-scope modules
   * appear in both lists, each carrying only the matching settings.
   */
  getModulesByScope(scope: SettingScope): readonly SettingsModule[];
  /** Returns all resolved definitions in module and declaration order. */
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

  register(module: SettingsModule): Disposable {
    assertValidModuleId(module.id);
    if (this.modules.has(module.id)) {
      throw new Error(
        `A settings module is already registered for id "${module.id}".`
      );
    }

    const definitions = new Map<string, ResolvedDefinition>();
    const bySection = new Map<string, ResolvedDefinition[]>();
    const sectionIds = new Set<string>();
    for (const section of module.sections) {
      this.collectSection(module.id, section, definitions, bySection, sectionIds);
    }

    const registered: RegisteredModule = {
      module,
      definitions,
      bySection,
      sectionIds: [...sectionIds]
    };
    this.modules.set(module.id, registered);
    this.moduleOrder.push(module.id);
    for (const sectionId of sectionIds) {
      this.sectionOwners.set(sectionId, module.id);
    }

    let disposed = false;
    return {
      dispose: (): void => {
        if (disposed) {
          return;
        }
        disposed = true;
        if (this.modules.get(module.id) !== registered) {
          return;
        }
        this.modules.delete(module.id);
        const index = this.moduleOrder.indexOf(module.id);
        if (index >= 0) {
          this.moduleOrder.splice(index, 1);
        }
        for (const sectionId of registered.sectionIds) {
          if (this.sectionOwners.get(sectionId) === module.id) {
            this.sectionOwners.delete(sectionId);
          }
        }
      }
    };
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
      // Half-open ranges [from, to) intersect when one starts before the other
      // ends and vice versa. Reject any overlap so the applier never sees two
      // migrations covering the same version boundary.
      if (
        migration.fromVersion < existing.toVersion &&
        existing.fromVersion < migration.toVersion
      ) {
        throw new Error(
          `Migration range [${migration.fromVersion}, ${migration.toVersion}) overlaps existing range [${existing.fromVersion}, ${existing.toVersion}).`
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
    return this.moduleOrder.map((id) => this.requireModule(id).module);
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
      const registered = this.requireModule(id);
      const defs = registered.bySection.get(sectionId);
      if (defs) return [...defs];
    }
    return [];
  }

  getModulesByScope(scope: SettingScope): readonly SettingsModule[] {
    const modules: SettingsModule[] = [];
    for (const id of this.moduleOrder) {
      const projected = projectModuleToScope(this.requireModule(id).module, scope);
      if (projected) modules.push(projected);
    }
    return modules;
  }

  getAllDefinitions(): readonly SettingDefinition[] {
    const all: SettingDefinition[] = [];
    for (const id of this.moduleOrder) {
      const registered = this.requireModule(id);
      for (const def of registered.definitions.values()) {
        all.push(def);
      }
    }
    return all;
  }

  /**
   * Returns the registered module for an ordered id, throwing a descriptive
   * error if the map/order invariant is broken instead of silently dropping it.
   */
  private requireModule(id: string): RegisteredModule {
    const registered = this.modules.get(id);
    if (!registered) {
      throw new Error(
        `Registry invariant broken: "${id}" is in moduleOrder but not in modules map.`
      );
    }
    return registered;
  }

  /**
   * Recursively walks a section (and its subsections), resolving each
   * definition's key to the full `moduleId.key` form and indexing by section.
   */
  private collectSection(
    moduleId: string,
    section: SettingSection,
    definitions: Map<string, ResolvedDefinition>,
    bySection: Map<string, ResolvedDefinition[]>,
    sectionIds: Set<string>
  ): void {
    if (sectionIds.has(section.id)) {
      throw new Error(
        `Duplicate section id "${section.id}" in module "${moduleId}".`
      );
    }
    const existingOwner = this.sectionOwners.get(section.id);
    if (existingOwner !== undefined && existingOwner !== moduleId) {
      throw new Error(
        `Section id "${section.id}" is already registered by another module.`
      );
    }
    sectionIds.add(section.id);

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
        bySection.set(section.id, bucket);
      }
    }

    if (section.subsections) {
      for (const sub of section.subsections) {
        this.collectSection(moduleId, sub, definitions, bySection, sectionIds);
      }
    }
  }
}

const MODULE_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function assertValidModuleId(moduleId: string): void {
  if (typeof moduleId !== "string" || !MODULE_ID_PATTERN.test(moduleId)) {
    throw new Error(
      `Invalid settings module id "${moduleId}". IDs must be lowercase kebab-case.`
    );
  }
}

/**
 * Projects a module onto one scope so a mixed-scope module can appear in both
 * the app and workspace navs, each carrying only the matching settings.
 *
 * A module with no matching settings is omitted unless it has no settings at
 * all and declared this scope — empty declared groupings still need a home.
 */
function projectModuleToScope(
  module: SettingsModule,
  scope: SettingScope
): SettingsModule | undefined {
  const sections = projectSectionsToScope(module.sections, scope);
  if (sections.length > 0) {
    return { ...module, scope, sections };
  }
  return module.scope === scope && !moduleHasSettings(module)
    ? { ...module, sections }
    : undefined;
}

function moduleHasSettings(module: SettingsModule): boolean {
  const walk = (sections: readonly SettingSection[]): boolean => {
    for (const section of sections) {
      if (section.settings && section.settings.length > 0) return true;
      if (section.subsections && walk(section.subsections)) return true;
    }
    return false;
  };
  return walk(module.sections);
}

function projectSectionsToScope(
  sections: readonly SettingSection[],
  scope: SettingScope
): SettingSection[] {
  const projected: SettingSection[] = [];
  for (const section of sections) {
    const settings = section.settings?.filter((def) => def.scope === scope);
    const subsections = section.subsections
      ? projectSectionsToScope(section.subsections, scope)
      : undefined;
    const hasSettings = settings !== undefined && settings.length > 0;
    const hasSubsections = subsections !== undefined && subsections.length > 0;
    if (!hasSettings && !hasSubsections) continue;
    projected.push({
      ...section,
      settings: hasSettings ? settings : undefined,
      subsections: hasSubsections ? subsections : undefined
    });
  }
  return projected;
}

/**
 * Resolves a definition's relative key to the full `moduleId.key` form and
 * applies the `portable` default (`true` except for `path` types).
 */
function resolveDefinition(
  moduleId: string,
  def: SettingDefinition
): ResolvedDefinition {
  assertValidDefinition(def);

  return {
    ...def,
    key: `${moduleId}.${def.key}`,
    portable: def.portable ?? def.type !== "path"
  };
}

/**
 * Validates the parts of a definition that can be supplied by untrusted
 * extension or manifest data despite the compile-time schema types.
 */
function assertValidDefinition(def: SettingDefinition): void {
  switch (def.type) {
    case "boolean":
      assertDefaultType(def, typeof def.default === "boolean", "a boolean");
      return;
    case "string":
      assertDefaultType(def, typeof def.default === "string", "a string");
      return;
    case "number":
      assertDefaultType(
        def,
        typeof def.default === "number" && Number.isFinite(def.default),
        "a finite number"
      );
      return;
    case "path":
      assertDefaultType(
        def,
        def.default === null || typeof def.default === "string",
        "a string or null"
      );
      return;
    case "enum":
      assertDefaultType(def, typeof def.default === "string", "a string");
      assertValidEnumDefinition(def);
      return;
    default:
      return assertNeverSettingType(def);
  }
}

/** Throws when a definition's default is not valid for its declared type. */
function assertDefaultType(
  def: SettingDefinition,
  isValid: boolean,
  expected: string
): void {
  if (!isValid) {
    throw new Error(
      `Invalid default for setting "${def.key}": expected ${expected} for type "${def.type}", received ${describeValue(def.default)}.`
    );
  }
}

/** Enforces the runtime requirements specific to enum definitions. */
function assertValidEnumDefinition(
  def: Extract<SettingDefinition, { readonly type: "enum" }>
): void {
  if (!Array.isArray(def.options)) {
    throw new Error(
      `Invalid enum setting "${def.key}": options must be a non-empty array.`
    );
  }
  if (def.options.length === 0) {
    throw new Error(
      `Invalid enum setting "${def.key}": options must not be empty.`
    );
  }
  if (def.options.some((option) => typeof option !== "string")) {
    throw new Error(
      `Invalid enum setting "${def.key}": every option must be a string.`
    );
  }
  if (!def.options.includes(def.default)) {
    throw new Error(
      `Invalid enum setting "${def.key}": default "${def.default}" is not one of [${def.options.join(", ")}].`
    );
  }
}

/** Describes a dynamic value without relying on serialization. */
function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "number" && !Number.isFinite(value)) {
    return String(value);
  }
  return typeof value;
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
