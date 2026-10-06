import { convertFileSrc } from "@tauri-apps/api/core";

import { invokeNativeCommand } from "./commands";

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

/**
 * Media MIME types by lowercase file extension.
 *
 * Covers every audio/video extension `inferTabKind` in `@thinkbrain/core`
 * maps to a media viewer (mp3, ogg, wav, flac, aac, m4a, opus, mp4, webm, mov,
 * mkv, avi) plus the common cousins that share those containers. An unknown
 * extension yields an empty `Blob` type so the element sniffs instead of
 * being refused outright.
 */
const MEDIA_MIME_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  flac: "audio/flac",
  weba: "audio/webm",
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  ogv: "video/ogg",
  avi: "video/x-msvideo"
};

function mediaMimeType(relativePath: string): string {
  const dot = relativePath.lastIndexOf(".");
  if (dot < 0) return "";
  return MEDIA_MIME_TYPES[relativePath.slice(dot + 1).toLowerCase()] ?? "";
}

/**
 * Loads a vault media file's bytes over IPC and returns a `blob:` object URL.
 *
 * The `<audio>`/`<video>` elements cannot stream from `asset://` on every
 * webview (WebKitGTK's GStreamer backend rejects the scheme; Android
 * mishandles its range requests), so media plays from bytes read through the
 * `read_media_file` command instead of a protocol URL. The caller owns the
 * returned URL and must `URL.revokeObjectURL` it when done.
 *
 * @throws A plain `Error` when `relativePath` would escape the vault — the
 *   same refusal `createVaultAssetResolver` applies to `asset://` URLs.
 */
export async function loadMediaObjectUrl(
  rootPath: string,
  relativePath: string
): Promise<string> {
  const segments = normalizeSegments(relativePath);
  if (!segments || segments.length === 0) {
    throw new Error(`Media path escapes the vault: ${relativePath}`);
  }

  const bytes = await invokeNativeCommand("read_media_file", {
    rootPath,
    relativePath: segments.join("/")
  });

  return URL.createObjectURL(new Blob([bytes], { type: mediaMimeType(relativePath) }));
}
