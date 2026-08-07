/**
 * Loads a trusted extension from a local directory.
 *
 * Both the file read and the module import are injected, so this module has no
 * Tauri or webview dependency and its tests need neither a filesystem nor a
 * DOM. `createDesktopLocalDirectoryLoader` wires the real implementations.
 *
 * A loaded extension is trusted local code that runs with full application
 * privileges. Validation here catches authoring mistakes and stops a broken
 * directory from leaving half-registered contributions behind; it is not a
 * sandbox, and nothing in the load path should be described as one.
 */

import {
  evaluateCompatibility,
  parseExtensionManifest,
  resolveEntryPath,
  validateExtensionModule,
  type CompatibilityHost,
  type ExtensionManifest,
  type ManifestDiagnostic
} from "@thinkbrain/core";

import { HOST_COMPATIBILITY } from "./hostCompatibility";
import type { DesktopExtensionActivation } from "./desktopExtensionHost";

/** Reads one file inside an extension directory. Rejects when unreadable. */
export type ExtensionFileReader = (
  directory: string,
  relativePath: string
) => Promise<string>;

/** Evaluates a pre-bundled ESM source and returns its module namespace. */
export type ExtensionModuleImporter = (
  code: string,
  sourceUrl: string
) => Promise<unknown>;

/** An extension that loaded successfully, ready for the bootstrap. */
export interface LoadedExtension {
  readonly directory: string;
  readonly manifest: ExtensionManifest;
  readonly activate: DesktopExtensionActivation;
  readonly deactivate: ((context: never) => void | Promise<void>) | undefined;
}

export interface LoadExtensionResult {
  /** The loaded extension, or `null` when any error diagnostic was produced. */
  readonly extension: LoadedExtension | null;
  readonly diagnostics: readonly ManifestDiagnostic[];
}

export interface LocalDirectoryLoaderOptions {
  readonly readFile: ExtensionFileReader;
  readonly importModule: ExtensionModuleImporter;
  readonly compatibilityHost?: CompatibilityHost;
}

export interface LocalDirectoryLoader {
  load(directory: string): Promise<LoadExtensionResult>;
}

const MANIFEST_FILE = "extension.json";

const error = (code: string, message: string): ManifestDiagnostic => ({
  code,
  message,
  severity: "error"
});

const failure = (...diagnostics: ManifestDiagnostic[]): LoadExtensionResult => ({
  extension: null,
  diagnostics
});

const describe = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/** Joins a directory and a relative path into a `file://` url for stack traces. */
function sourceUrlFor(directory: string, relativePath: string): string {
  const normalized = directory.replace(/\\/g, "/").replace(/\/$/, "");
  const prefix = normalized.startsWith("/") ? "file://" : "file:///";
  return `${prefix}${normalized}/${relativePath}`;
}

/**
 * Drops panel contributions, which a disk extension cannot supply yet.
 *
 * A panel factory returns a React node, and a bundled extension that imported
 * React would run against a second copy of the library. Supporting panels needs
 * a framework-neutral mount contract, which is the contribution-surfaces story.
 * Until then the declaration is reported and removed, so the bootstrap never
 * registers a stub that nothing can fulfil.
 */
function withoutPanels(
  manifest: ExtensionManifest,
  diagnostics: ManifestDiagnostic[]
): ExtensionManifest {
  if (manifest.contributes.panels.length === 0) return manifest;

  diagnostics.push({
    code: "panels_not_supported",
    message:
      "Panels declared by a local extension are not loaded yet; its commands and settings still work.",
    severity: "warning"
  });

  return {
    ...manifest,
    contributes: { ...manifest.contributes, panels: [] }
  };
}

/**
 * Creates a loader for extension directories.
 *
 * @param options Injected file reader, module importer, and host descriptor.
 * @returns A loader whose `load` never throws; failures become diagnostics.
 */
export function createLocalDirectoryLoader(
  options: LocalDirectoryLoaderOptions
): LocalDirectoryLoader {
  const compatibilityHost = options.compatibilityHost ?? HOST_COMPATIBILITY;

  const load = async (directory: string): Promise<LoadExtensionResult> => {
    let manifestSource: string;
    try {
      manifestSource = await options.readFile(directory, MANIFEST_FILE);
    } catch (cause: unknown) {
      return failure(
        error("manifest_unreadable", `Could not read ${MANIFEST_FILE}: ${describe(cause)}`)
      );
    }

    let manifestValue: unknown;
    try {
      manifestValue = JSON.parse(manifestSource);
    } catch (cause: unknown) {
      return failure(
        error("manifest_invalid_json", `${MANIFEST_FILE} is not valid JSON: ${describe(cause)}`)
      );
    }

    const parsed = parseExtensionManifest(manifestValue);
    if (!parsed.manifest) return failure(...parsed.diagnostics);

    const diagnostics: ManifestDiagnostic[] = [...parsed.diagnostics];

    const compatibility = evaluateCompatibility(parsed.manifest, compatibilityHost);
    if (!compatibility.compatible) {
      return failure(...diagnostics, ...compatibility.reasons);
    }
    diagnostics.push(...compatibility.reasons);

    const entry = resolveEntryPath(parsed.manifest.main);
    if (!entry.path) return failure(...diagnostics, entry.diagnostic!);

    let entrySource: string;
    try {
      entrySource = await options.readFile(directory, entry.path);
    } catch (cause: unknown) {
      return failure(
        ...diagnostics,
        error("entry_unreadable", `Could not read ${entry.path}: ${describe(cause)}`)
      );
    }

    let namespace: unknown;
    try {
      namespace = await options.importModule(entrySource, sourceUrlFor(directory, entry.path));
    } catch (cause: unknown) {
      return failure(
        ...diagnostics,
        error("entry_import_failed", `${entry.path} failed to load: ${describe(cause)}`)
      );
    }

    const validated = validateExtensionModule<
      DesktopExtensionActivation,
      (context: never) => void | Promise<void>
    >(namespace);
    if (!validated.module) return failure(...diagnostics, validated.diagnostic!);

    return {
      extension: {
        directory,
        manifest: withoutPanels(parsed.manifest, diagnostics),
        activate: validated.module.activate,
        deactivate: validated.module.deactivate
      },
      diagnostics
    };
  };

  return { load };
}
