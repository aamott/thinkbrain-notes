/**
 * Adds, reloads, and removes extensions loaded from local directories.
 *
 * The loader turns a directory into a manifest and an activate function; the
 * bootstrap owns registration, stubs, lazy activation, and disposal. This joins
 * the two and is the only place that knows a directory can be re-read.
 *
 * Every extension loaded here is trusted local code with full application
 * privileges. Callers are responsible for telling the user so before adding a
 * directory.
 */

import type { ManifestDiagnostic } from "@thinkbrain/core";

import type { ExtensionBootstrap } from "./bootstrapRef";
import type { LocalDirectoryLoader } from "./localDirectoryLoader";

export interface LoadOutcome {
  readonly loaded: boolean;
  readonly diagnostics: readonly ManifestDiagnostic[];
}

export interface LocalExtensionsOptions {
  readonly loader: LocalDirectoryLoader;
  readonly bootstrap: ExtensionBootstrap;
}

export interface LocalExtensions {
  /** Loads a directory and registers its contributions. */
  add(directory: string): Promise<LoadOutcome>;
  /** Unloads an extension, then loads its directory again. */
  reload(id: string): Promise<LoadOutcome>;
  /** Unloads an extension and disposes everything it registered. */
  remove(id: string): Promise<void>;
}

const failed = (message: string, code: string): LoadOutcome => ({
  loaded: false,
  diagnostics: [{ code, message, severity: "error" }]
});

export function createLocalExtensions(options: LocalExtensionsOptions): LocalExtensions {
  const { loader, bootstrap } = options;

  const directoryOf = (id: string): string | undefined =>
    bootstrap.entries().find((entry) => entry.id === id)?.directory;

  const load = async (directory: string): Promise<LoadOutcome> => {
    const result = await loader.load(directory);
    if (!result.extension) return { loaded: false, diagnostics: result.diagnostics };

    bootstrap.addLocalExtension(result.extension, result.diagnostics);
    return { loaded: true, diagnostics: result.diagnostics };
  };

  return {
    add: async (directory) => {
      const existing = bootstrap.entries().find((entry) => entry.directory === directory);
      if (existing) {
        return failed(
          `"${directory}" is already loaded as "${existing.id}".`,
          "directory_already_loaded"
        );
      }
      return load(directory);
    },

    reload: async (id) => {
      const directory = directoryOf(id);
      if (directory === undefined) {
        return failed(`Extension "${id}" is not loaded from a directory.`, "not_loaded");
      }

      // Removed first, and awaited: the replacement registers the same
      // contribution ids, so the old registrations must be gone before it runs.
      // A failed reload therefore leaves the extension unloaded rather than
      // running against a module that no longer matches what is on disk.
      await bootstrap.removeLocalExtension(id);
      return load(directory);
    },

    remove: (id) => bootstrap.removeLocalExtension(id)
  };
}
