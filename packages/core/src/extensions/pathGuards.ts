/**
 * Shared path-validation guards for extension-supplied paths.
 *
 * Both the core manifest loader (`loader.ts`) and the desktop extension
 * workspace (`extensionWorkspace.ts`) reject Windows drive-letter absolute
 * paths as a path-escape guard. Centralizing the rule here keeps the two
 * copies from drifting on a security-adjacent check.
 */

/** Matches a Windows drive-letter absolute path, e.g. `C:\` or `D:/`. */
export const WINDOWS_ABSOLUTE = /^[A-Za-z]:[\\/]/;
