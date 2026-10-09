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

import { getErrorMessage, type ManifestDiagnostic } from "@thinkbrain/core";

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
  /**
   * Forgets a stored directory without resolving an extension id — the
   * removal path for a startup failure, which has no loaded entry for
   * {@link remove} to find. Also clears the directory from
   * {@link startupFailures}.
   */
  forget(directory: string): Promise<void>;
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

/**
 * Canonical spelling of a directory for dedup and comparison.
 *
 * Unifies separators and strips trailing slashes so `/ext/a`, `/ext/a/`, and
 * `C:\ext\a`-style aliases of one directory cannot double-load or
 * double-persist. Deliberately stops short of case folding or symlink
 * resolution: whether two spellings name one directory depends on the
 * filesystem's case sensitivity, which only the native side knows.
 */
const normalizeDirectory = (directory: string): string =>
  directory.replace(/\\/g, "/").replace(/\/+$/, "");

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
    const deduped = [...new Set(next)];
    // `stored` tracks what the store actually holds, so it only moves once the
    // write succeeds — a failed save must not record a directory as forgotten
    // (or remembered) when the disk still says otherwise.
    await directories?.save(deduped);
    stored = deduped;
  };

  const directoryOf = (id: string): string | undefined =>
    bootstrap.entries().find((entry) => entry.id === id)?.directory;

  const load = async (directory: string): Promise<LoadOutcome> => {
    const result = await loader.load(normalizeDirectory(directory));
    if (!result.extension) return { loaded: false, diagnostics: result.diagnostics };

    try {
      bootstrap.addLocalExtension(result.extension, result.diagnostics);
    } catch (error: unknown) {
      // Concurrent `add`s of the same directory (or two directories bundling
      // the same extension id) can both pass the `add` pre-check and reach here;
      // `addLocalExtension` throws synchronously on a duplicate id. Convert the
      // throw into a failed outcome so the caller sees a clear message instead
      // of a raw "already registered" error escaping `add`.
      const message = getErrorMessage(error);
      return { loaded: false, diagnostics: [{ code: "extension_already_registered", message, severity: "error" }] };
    }
    return { loaded: true, diagnostics: result.diagnostics };
  };

  return {
    add: async (directory) => {
      const normalized = normalizeDirectory(directory);
      const existing = bootstrap.entries().find(
        (entry) => entry.directory !== undefined && normalizeDirectory(entry.directory) === normalized
      );
      if (existing) {
        return failed(
          `"${normalized}" is already loaded as "${existing.id}".`,
          "directory_already_loaded"
        );
      }

      const outcome = await load(normalized);
      if (!outcome.loaded) {
        return outcome;
      }
      try {
        await persist([...stored, normalized]);
      } catch (error: unknown) {
        // The extension *is* loaded for this session — only remembering it for
        // the next one failed. Rejecting here would report a load failure and
        // strand a retry behind `directory_already_loaded`, so the persistence
        // failure rides along as a warning diagnostic instead.
        console.error(
          `[extensions] Failed to persist extension directory "${normalized}".`,
          error
        );
        return {
          loaded: true,
          diagnostics: [
            ...outcome.diagnostics,
            {
              code: "directory_persist_failed",
              message: `The extension loaded, but "${normalized}" could not be remembered for next launch: ${getErrorMessage(error)}`,
              severity: "warning" as const
            }
          ]
        };
      }
      if (failures.some((failure) => failure.directory === normalized)) {
        setFailures(failures.filter((failure) => failure.directory !== normalized));
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
      // This controller only manages directory-loaded extensions. Without the
      // guard, `remove("some-builtin")` would dispose a built-in's
      // registrations — `removeLocalExtension` removes any registered id.
      if (directory === undefined) return;
      await bootstrap.removeLocalExtension(id);
      if (stored.includes(directory)) {
        try {
          await persist(stored.filter((entry) => entry !== directory));
        } catch (error: unknown) {
          // The extension is already unloaded; only forgetting it failed.
          // Rejecting would report a removal failure that already succeeded.
          console.error(
            `[extensions] Removed extension but failed to forget "${directory}".`,
            error
          );
        }
      }
    },

    forget: async (directory) => {
      const normalized = normalizeDirectory(directory);
      if (stored.includes(normalized)) {
        // Unlike `remove`, nothing is unloaded first — forgetting is the
        // whole operation, so a failed save rejects rather than logging and
        // swallowing: the directory would be retried (and re-reported) at the
        // next launch while the panel already claimed it gone.
        await persist(stored.filter((entry) => entry !== normalized));
      }
      if (failures.some((failure) => failure.directory === normalized)) {
        setFailures(failures.filter((failure) => failure.directory !== normalized));
      }
    },

    restore: async () => {
      if (!directories) return;

      stored = [...new Set((await directories.load()).map(normalizeDirectory))];
      const found: StartupFailure[] = [];
      for (const directory of stored) {
        const outcome = await load(directory);
        if (!outcome.loaded) found.push({ directory, diagnostics: outcome.diagnostics });
      }
      setFailures(found);
    },

    startupFailures: () => failures,

    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
