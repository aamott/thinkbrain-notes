/**
 * Adds, reloads, and removes extensions loaded from local directories.
 *
 * The loader turns a directory into a manifest and an activate function; the
 * bootstrap owns registration, stubs, lazy activation, and disposal. This joins
 * the two and is the only place that knows a directory can be re-read.
 *
 * Added directories are remembered through an injected store so they survive a
 * restart. A stored directory that fails to load at startup stays stored — the
 * user fixes it and reloads rather than silently losing the entry — and its
 * diagnostics are kept for the Extensions panel to display.
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

/** Where the list of added directories is remembered between sessions. */
export interface ExtensionDirectoryStore {
  load(): Promise<readonly string[]>;
  save(directories: readonly string[]): Promise<void>;
}

/** A stored directory that failed to load during {@link LocalExtensions.restore}. */
export interface StartupFailure {
  readonly directory: string;
  readonly diagnostics: readonly ManifestDiagnostic[];
}

export interface LocalExtensionsOptions {
  readonly loader: LocalDirectoryLoader;
  readonly bootstrap: ExtensionBootstrap;
  /** Omitted in tests and outside Tauri; persistence then does nothing. */
  readonly directories?: ExtensionDirectoryStore;
}

export interface LocalExtensions {
  /** Loads a directory, registers its contributions, and remembers it. */
  add(directory: string): Promise<LoadOutcome>;
  /** Unloads an extension, then loads its directory again. */
  reload(id: string): Promise<LoadOutcome>;
  /** Unloads an extension, disposes its registrations, and forgets it. */
  remove(id: string): Promise<void>;
  /** Loads the directories remembered from a previous session. */
  restore(): Promise<void>;
  /** Stored directories that failed to load during {@link restore}. */
  startupFailures(): readonly StartupFailure[];
  /** Notifies when {@link startupFailures} changes. */
  subscribe(listener: () => void): () => void;
}

const failed = (message: string, code: string): LoadOutcome => ({
  loaded: false,
  diagnostics: [{ code, message, severity: "error" }]
});

export function createLocalExtensions(options: LocalExtensionsOptions): LocalExtensions {
  const { loader, bootstrap, directories } = options;

  let stored: readonly string[] = [];
  let failures: readonly StartupFailure[] = [];
  const listeners = new Set<() => void>();

  const setFailures = (next: readonly StartupFailure[]): void => {
    failures = next;
    for (const listener of listeners) listener();
  };

  const persist = async (next: readonly string[]): Promise<void> => {
    stored = [...new Set(next)];
    await directories?.save(stored);
  };

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

      const outcome = await load(directory);
      if (outcome.loaded) {
        await persist([...stored, directory]);
        if (failures.some((failure) => failure.directory === directory)) {
          setFailures(failures.filter((failure) => failure.directory !== directory));
        }
      }
      return outcome;
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

    remove: async (id) => {
      const directory = directoryOf(id);
      await bootstrap.removeLocalExtension(id);
      if (directory !== undefined && stored.includes(directory)) {
        await persist(stored.filter((entry) => entry !== directory));
      }
    },

    restore: async () => {
      if (!directories) return;

      stored = [...new Set(await directories.load())];
      const found: StartupFailure[] = [];
      for (const directory of stored) {
        const outcome = await load(directory);
        if (!outcome.loaded) found.push({ directory, diagnostics: outcome.diagnostics });
      }
      if (found.length > 0) setFailures(found);
    },

    startupFailures: () => failures,

    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
