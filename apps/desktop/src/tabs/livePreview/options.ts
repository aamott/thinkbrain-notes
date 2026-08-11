import type { NoteIndexEntry } from "@thinkbrain/core";

/** Host-supplied capabilities for the live-preview extension. */
export interface LivePreviewOptions {
  /**
   * Resolves a Markdown image source to a URL the webview can load.
   *
   * Returning `null` means "not resolvable" and the image degrades to styled
   * alt text. Absolute `http(s)` sources bypass this callback entirely. Keeping
   * this injectable is what lets the extension stay free of Tauri imports.
   */
  readonly resolveAssetUrl?: (src: string) => string | null;
  /**
   * The vault's note index, used to distinguish resolved from unresolved
   * `[[Target]]` wiki links and to resolve the target at click time.
   */
  readonly noteIndex?: readonly NoteIndexEntry[];
  /**
   * Called when the user clicks a resolved `[[Target]]` wiki link.
   *
   * The argument is the vault-relative path returned by
   * `resolveWikiLinkTarget`. Omitted when no workspace is open.
   */
  readonly onOpenNote?: (relativePath: string) => void;
}
