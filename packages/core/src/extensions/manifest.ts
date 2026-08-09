/**
 * `extension.json` manifest parsing.
 *
 * Parsing never throws: every problem becomes a diagnostic, and all problems
 * are collected rather than short-circuited so a host can show an author
 * everything wrong at once. Any `error` diagnostic yields a `null` manifest.
 */

import { EXTENSION_ID_PATTERN } from "../lifecycle";
import { isRecord } from "../settings/internal";

/** Platforms an extension can declare support for. */
export type ExtensionPlatform = "desktop" | "mobile";

/** A command declared in the manifest, using an extension-relative id. */
export interface ManifestCommand {
  readonly id: string;
  readonly title: string;
}

/** A panel declared in the manifest, using an extension-relative id. */
export interface ManifestPanel {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly side: "left" | "right";
}

/** Contributions a host can register before the extension is activated. */
export interface ManifestContributions {
  readonly commands: readonly ManifestCommand[];
  readonly panels: readonly ManifestPanel[];
}

/** A parsed, validated extension manifest. */
export interface ExtensionManifest {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  /** Semver range of the host API this extension expects. */
  readonly apiVersion: string;
  readonly engines: { readonly platform: readonly ExtensionPlatform[] };
  readonly activationEvents: readonly string[];
  /** Soft compatibility hints. Never permissions, never a sandbox. */
  readonly capabilities: readonly string[];
  readonly contributes: ManifestContributions;
  /**
   * Directory-relative entry module, for extensions loaded from disk.
   *
   * Absent for built-ins, which pair a manifest with an imported activate
   * function and have no file to resolve. Path rules live in `loader.ts`.
   */
  readonly main?: string;
}

export interface ManifestDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly severity: "error" | "warning";
}

export interface ManifestParseResult {
  readonly manifest: ExtensionManifest | null;
  readonly diagnostics: readonly ManifestDiagnostic[];
}

// `id` is validated separately: it has its own pattern rule, and reporting an
// empty id as both "missing" and "invalid" would be two diagnostics for one
// mistake.
const REQUIRED_FIELDS = ["name", "version", "apiVersion"] as const;
const RELATIVE_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const KNOWN_PLATFORMS = new Set<string>(["desktop", "mobile"]);
const KNOWN_ACTIVATION_EVENTS = /^(onStartup|onCommand:[a-z][a-z0-9-]*|onView:[a-z][a-z0-9-]*)$/;
const DEFAULT_PLATFORMS: readonly ExtensionPlatform[] = ["desktop", "mobile"];

const error = (code: string, message: string): ManifestDiagnostic => ({
  code,
  message,
  severity: "error"
});

const warning = (code: string, message: string): ManifestDiagnostic => ({
  code,
  message,
  severity: "warning"
});

/** Reads a string array field, reporting non-string entries. */
function readStringArray(
  raw: unknown,
  field: string,
  diagnostics: ManifestDiagnostic[]
): string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    diagnostics.push(error("manifest_invalid_field", `"${field}" must be an array.`));
    return [];
  }
  const values: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") {
      diagnostics.push(error("manifest_invalid_field", `"${field}" must contain only strings.`));
      continue;
    }
    values.push(entry);
  }
  return values;
}

function readPlatforms(
  raw: unknown,
  diagnostics: ManifestDiagnostic[]
): readonly ExtensionPlatform[] {
  if (!isRecord(raw)) return DEFAULT_PLATFORMS;
  const declared = readStringArray(raw.platform, "engines.platform", diagnostics);
  if (declared.length === 0) return DEFAULT_PLATFORMS;

  const platforms: ExtensionPlatform[] = [];
  for (const value of declared) {
    if (!KNOWN_PLATFORMS.has(value)) {
      diagnostics.push(
        error("manifest_invalid_platform", `Unknown platform "${value}" in engines.platform.`)
      );
      continue;
    }
    platforms.push(value as ExtensionPlatform);
  }
  return platforms.length > 0 ? platforms : DEFAULT_PLATFORMS;
}

/** Validates a contributed entry's relative id and required string fields. */
function readContribution<T>(
  raw: unknown,
  index: number,
  kind: string,
  fields: readonly string[],
  diagnostics: ManifestDiagnostic[],
  build: (record: Record<string, unknown>) => T
): T | null {
  if (!isRecord(raw)) {
    diagnostics.push(error("manifest_invalid_field", `contributes.${kind}[${index}] must be an object.`));
    return null;
  }

  const id = raw.id;
  if (typeof id !== "string" || !RELATIVE_ID_PATTERN.test(id)) {
    diagnostics.push(
      error(
        "manifest_invalid_contribution_id",
        `contributes.${kind}[${index}].id must be a lowercase kebab-case id relative to the extension (not "${String(id)}").`
      )
    );
    return null;
  }

  for (const field of fields) {
    if (typeof raw[field] !== "string" || (raw[field] as string).length === 0) {
      diagnostics.push(
        error("manifest_invalid_field", `contributes.${kind}[${index}].${field} must be a non-empty string.`)
      );
      return null;
    }
  }

  return build(raw);
}

function readContributions(
  raw: unknown,
  diagnostics: ManifestDiagnostic[]
): ManifestContributions {
  if (raw === undefined) return { commands: [], panels: [] };
  if (!isRecord(raw)) {
    diagnostics.push(error("manifest_invalid_field", `"contributes" must be an object.`));
    return { commands: [], panels: [] };
  }

  const commands: ManifestCommand[] = [];
  const rawCommands = Array.isArray(raw.commands) ? raw.commands : [];
  rawCommands.forEach((entry, index) => {
    const command = readContribution(entry, index, "commands", ["title"], diagnostics, (record) => ({
      id: record.id as string,
      title: record.title as string
    }));
    if (command) commands.push(command);
  });

  const panels: ManifestPanel[] = [];
  const rawPanels = Array.isArray(raw.panels) ? raw.panels : [];
  rawPanels.forEach((entry, index) => {
    const panel = readContribution(
      entry,
      index,
      "panels",
      ["label", "icon"],
      diagnostics,
      (record) => ({
        id: record.id as string,
        label: record.label as string,
        icon: record.icon as string,
        side: record.side === "left" ? ("left" as const) : ("right" as const)
      })
    );
    if (!panel) return;
    if (entry && isRecord(entry) && entry.side !== "left" && entry.side !== "right") {
      diagnostics.push(
        error("manifest_invalid_field", `contributes.panels[${index}].side must be "left" or "right".`)
      );
      return;
    }
    panels.push(panel);
  });

  return { commands, panels };
}

/**
 * Parses an untrusted value into an {@link ExtensionManifest}.
 *
 * @param value Parsed JSON, or any untrusted value.
 * @returns The manifest (or `null` when unusable) plus every diagnostic found.
 */
export function parseExtensionManifest(value: unknown): ManifestParseResult {
  const diagnostics: ManifestDiagnostic[] = [];

  if (!isRecord(value)) {
    return {
      manifest: null,
      diagnostics: [error("manifest_not_object", "An extension manifest must be a JSON object.")]
    };
  }

  for (const field of REQUIRED_FIELDS) {
    if (typeof value[field] !== "string" || (value[field] as string).length === 0) {
      diagnostics.push(
        error("manifest_missing_field", `"${field}" is required and must be a non-empty string.`)
      );
    }
  }

  const id = typeof value.id === "string" ? value.id : "";
  if (typeof value.id !== "string") {
    diagnostics.push(
      error("manifest_missing_field", `"id" is required and must be a non-empty string.`)
    );
  } else if (!EXTENSION_ID_PATTERN.test(id)) {
    diagnostics.push(
      error(
        "manifest_invalid_id",
        `Extension id "${id}" must be lowercase kebab-case matching ${EXTENSION_ID_PATTERN.source}.`
      )
    );
  }

  const activationEvents = readStringArray(value.activationEvents, "activationEvents", diagnostics);
  for (const event of activationEvents) {
    if (!KNOWN_ACTIVATION_EVENTS.test(event)) {
      // A warning, not an error: the epic lists activation events this host does
      // not implement yet, and adding one later must not break older manifests.
      diagnostics.push(
        warning(
          "manifest_unknown_activation_event",
          `Activation event "${event}" is not supported by this host and will be ignored.`
        )
      );
    }
  }

  if (value.main !== undefined && typeof value.main !== "string") {
    diagnostics.push(error("manifest_invalid_field", `"main" must be a string.`));
  }

  const manifest: ExtensionManifest = {
    id,
    ...(typeof value.main === "string" ? { main: value.main } : {}),
    name: typeof value.name === "string" ? value.name : "",
    version: typeof value.version === "string" ? value.version : "",
    apiVersion: typeof value.apiVersion === "string" ? value.apiVersion : "",
    engines: { platform: readPlatforms(value.engines, diagnostics) },
    activationEvents,
    capabilities: readStringArray(value.capabilities, "capabilities", diagnostics),
    contributes: readContributions(value.contributes, diagnostics)
  };

  const fatal = diagnostics.some((diagnostic) => diagnostic.severity === "error");
  return { manifest: fatal ? null : manifest, diagnostics };
}
