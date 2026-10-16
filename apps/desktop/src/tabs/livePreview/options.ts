import type { MarkdownLinkTarget, NoteIndexEntry } from "@thinkbrain/core";

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
   * Vault-relative path of the note being edited — the base `relative`
   * `[text](target)` links resolve against. Omitted outside a workspace,
   * which makes every relative target unresolved.
   */
  readonly relativePath?: string | null;
  /**
   * Called when the user follows a resolved link — a `[[Target]]` wiki link
   * or a `[text](target)` Markdown link — with the already-resolved target.
   * Internal targets are vault-relative paths; external ones are URLs the
   * host hands to the OS. Omitted when no workspace is open, which makes
   * every link a plain edit target.
   */
  readonly onOpenLink?: (target: MarkdownLinkTarget) => void;
  /**
   * Source mode — live preview is off and the syntax is always visible, so
   * only Mod+click follows. The extension mounts just the follow handler.
   */
  readonly sourceMode?: boolean;
}
