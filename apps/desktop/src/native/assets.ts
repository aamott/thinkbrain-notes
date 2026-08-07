import { convertFileSrc } from "@tauri-apps/api/core";

/**
 * Turns a Markdown image source into a URL the webview can load.
 *
 * Lives in `native/` because it is the only part of live preview that knows
 * Tauri exists; the editor extension takes it as an injected callback.
 */

/**
 * Normalizes a POSIX-ish path, resolving `.` and `..` segments.
 *
 * Returns `null` when the path climbs above its starting point.
 */
function normalizeSegments(path: string): string[] | null {
  const out: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      // Escaping the vault root is refused rather than clamped: a note that
      // reaches outside its vault is a mistake worth surfacing, not hiding.
      if (out.length === 0) return null;
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out;
}

/**
 * Builds a resolver for one open note.
 *
 * @param rootPath Absolute path of the workspace root.
 * @param notePath Note path relative to `rootPath`.
 * @returns A resolver returning an asset URL, or `null` when unresolvable.
 */
export function createVaultAssetResolver(
  rootPath: string,
  notePath: string
): (src: string) => string | null {
  const noteDirectory = notePath.split("/").slice(0, -1).join("/");

  return (src: string): string | null => {
    if (!src) return null;

    const relative = src.startsWith("/")
      ? src.slice(1)
      : noteDirectory
        ? `${noteDirectory}/${src}`
        : src;

    const segments = normalizeSegments(relative);
    if (!segments || segments.length === 0) {
      console.error(`[assets] refusing to resolve image outside the vault: ${src}`);
      return null;
    }

    return convertFileSrc(`${rootPath}/${segments.join("/")}`);
  };
}
