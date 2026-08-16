/**
 * Wires the local-directory loader to the desktop's real file and module I/O.
 *
 * The entry module is a single pre-bundled ESM file. It is read as text through
 * the native bridge, given a `sourceURL` so devtools and stack traces name the
 * file on disk, and imported from a blob url.
 *
 * A blob url is used rather than Tauri's `asset:` protocol because reloading
 * must produce a genuinely fresh module. Relative imports resolved through
 * `asset:` would stay cached in the ESM registry when only the entry url is
 * cache-busted, so a reload would run new entry code against stale submodules.
 * One self-contained module behind a new blob has no such graph.
 */

import { invokeNativeCommand } from "../native/commands";
import {
  createLocalDirectoryLoader,
  type ExtensionModuleImporter,
  type LocalDirectoryLoader
} from "./localDirectoryLoader";

/** Reads a file inside an extension directory through the native bridge. */
async function readExtensionFile(directory: string, relativePath: string): Promise<string> {
  return invokeNativeCommand("read_extension_file", { directory, relativePath });
}

/** Evaluates one url as an ES module. Injected so tests need no real blob. */
type DynamicImport = (url: string) => Promise<unknown>;

const dynamicImport: DynamicImport = (url) => import(/* @vite-ignore */ url);

/**
 * Creates an importer that evaluates pre-bundled ESM source from a blob url.
 *
 * The url is revoked as soon as the import settles: a single-file bundle has
 * nothing left to fetch once evaluated, and stack traces keep naming the file
 * on disk through the `sourceURL` annotation. The module itself stays in the
 * ESM registry, which is inherent to same-context loading.
 */
export function createExtensionModuleImporter(
  importModule: DynamicImport = dynamicImport
): ExtensionModuleImporter {
  return async (code, sourceUrl) => {
    const annotated = `${code}\n//# sourceURL=${sourceUrl}\n`;
    const objectUrl = URL.createObjectURL(new Blob([annotated], { type: "text/javascript" }));

    try {
      return await importModule(objectUrl);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };
}

/** The loader used by the running desktop app. */
export function createDesktopLocalDirectoryLoader(): LocalDirectoryLoader {
  return createLocalDirectoryLoader({
    readFile: readExtensionFile,
    importModule: createExtensionModuleImporter()
  });
}
