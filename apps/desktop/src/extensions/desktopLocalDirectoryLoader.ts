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

/** Blob urls minted for loaded entry modules, revoked on unload. */
const objectUrls = new Map<string, string>();

/** Reads a file inside an extension directory through the native bridge. */
async function readExtensionFile(directory: string, relativePath: string): Promise<string> {
  return invokeNativeCommand("read_extension_file", { directory, relativePath });
}

/**
 * Imports pre-bundled ESM source from a blob url.
 *
 * The url is retained so {@link revokeExtensionModule} can free it; the module
 * itself stays in the ESM registry, which is inherent to same-context loading.
 */
export const importExtensionModule: ExtensionModuleImporter = async (code, sourceUrl) => {
  const annotated = `${code}\n//# sourceURL=${sourceUrl}\n`;
  const objectUrl = URL.createObjectURL(new Blob([annotated], { type: "text/javascript" }));
  objectUrls.set(sourceUrl, objectUrl);

  try {
    return (await import(/* @vite-ignore */ objectUrl)) as unknown;
  } catch (error: unknown) {
    URL.revokeObjectURL(objectUrl);
    objectUrls.delete(sourceUrl);
    throw error;
  }
};

/** Frees the blob url minted for one entry module. */
export function revokeExtensionModule(sourceUrl: string): void {
  const objectUrl = objectUrls.get(sourceUrl);
  if (!objectUrl) return;
  URL.revokeObjectURL(objectUrl);
  objectUrls.delete(sourceUrl);
}

/** The loader used by the running desktop app. */
export function createDesktopLocalDirectoryLoader(): LocalDirectoryLoader {
  return createLocalDirectoryLoader({
    readFile: readExtensionFile,
    importModule: importExtensionModule
  });
}
