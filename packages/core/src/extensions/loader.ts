/**
 * Pure validation for extensions loaded from a directory.
 *
 * Nothing here touches a filesystem, a webview, or a host: the desktop loader
 * supplies the I/O. Keeping the rules here means they can be tested directly
 * and reused by the later file-installation story.
 *
 * A loaded extension is trusted local code running with full application
 * privileges. These checks catch authoring mistakes; they are not a sandbox.
 */

import type { ManifestDiagnostic } from "./manifest";

/** The entry module's contract with the host. */
export interface ExtensionModule<Activate, Deactivate> {
  readonly activate: Activate;
  readonly deactivate: Deactivate | undefined;
}

export interface EntryPathResult {
  /** The directory-relative entry path, or `null` when unusable. */
  readonly path: string | null;
  readonly diagnostic: ManifestDiagnostic | null;
}

export interface ExtensionModuleResult<Activate, Deactivate> {
  readonly module: ExtensionModule<Activate, Deactivate> | null;
  readonly diagnostic: ManifestDiagnostic | null;
}

/** Entry modules are pre-bundled ESM; nothing else is imported at runtime. */
const JAVASCRIPT_ENTRY = /\.m?js$/;
const WINDOWS_ABSOLUTE = /^[A-Za-z]:[\\/]/;

const error = (code: string, message: string): ManifestDiagnostic => ({
  code,
  message,
  severity: "error"
});

const isCallable = (value: unknown): boolean => typeof value === "function";

/**
 * Resolves the manifest's `main` to a directory-relative entry path.
 *
 * @param main The manifest's `main` field, or `undefined` for the default.
 * @returns The relative path, or a diagnostic explaining why it was rejected.
 */
export function resolveEntryPath(main: string | undefined): EntryPathResult {
  if (main === undefined) return { path: "extension.js", diagnostic: null };

  if (typeof main !== "string" || main.length === 0) {
    return {
      path: null,
      diagnostic: error("entry_invalid_main", `"main" must be a non-empty string.`)
    };
  }

  if (main.startsWith("/") || main.startsWith("\\") || WINDOWS_ABSOLUTE.test(main)) {
    return {
      path: null,
      diagnostic: error(
        "entry_absolute_path",
        `"main" must be relative to the extension directory (not "${main}").`
      )
    };
  }

  // Checked on both separators: the manifest is authored by hand and may use
  // either, while the native side only ever sees the form written here.
  const segments = main.split(/[\\/]/);
  if (segments.includes("..")) {
    return {
      path: null,
      diagnostic: error(
        "entry_escapes_directory",
        `"main" must not leave the extension directory (not "${main}").`
      )
    };
  }

  if (!JAVASCRIPT_ENTRY.test(main)) {
    return {
      path: null,
      diagnostic: error(
        "entry_not_javascript",
        `"main" must name a pre-bundled .js or .mjs module (not "${main}").`
      )
    };
  }

  return { path: main, diagnostic: null };
}

/**
 * Checks that an imported module namespace exports the host's entry contract.
 *
 * @param namespace The imported module namespace.
 * @returns The narrowed module, or a diagnostic naming the missing export.
 */
export function validateExtensionModule<Activate, Deactivate>(
  namespace: unknown
): ExtensionModuleResult<Activate, Deactivate> {
  if (typeof namespace !== "object" || namespace === null) {
    return {
      module: null,
      diagnostic: error("entry_not_a_module", "The entry module did not produce any exports.")
    };
  }

  const exports = namespace as Record<string, unknown>;

  if (!isCallable(exports.activate)) {
    return {
      module: null,
      diagnostic: error(
        "entry_missing_activate",
        "The entry module must export a function named `activate`."
      )
    };
  }

  // A non-callable `deactivate` is rejected rather than ignored: silently
  // dropping it would skip the author's cleanup on every unload.
  if (exports.deactivate !== undefined && !isCallable(exports.deactivate)) {
    return {
      module: null,
      diagnostic: error(
        "entry_invalid_deactivate",
        "The entry module's `deactivate` export must be a function."
      )
    };
  }

  return {
    module: {
      activate: exports.activate as Activate,
      deactivate: exports.deactivate as Deactivate | undefined
    },
    diagnostic: null
  };
}
