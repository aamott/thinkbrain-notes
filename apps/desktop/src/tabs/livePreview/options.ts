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
}
