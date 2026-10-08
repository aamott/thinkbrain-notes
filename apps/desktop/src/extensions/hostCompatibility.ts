/**
 * What this host offers an extension, for compatibility evaluation.
 *
 * Deliberately free of value imports. Both the bootstrap and the local-directory
 * loader gate against this descriptor, and the loader is itself consumed by the
 * bootstrap — importing it from `bootstrap.ts` would close an import cycle.
 * Type-only imports are erased at build time, so they cannot close one either.
 *
 * Capabilities are compatibility hints, not permissions: an unsupported entry
 * produces a warning and the extension still loads.
 */

import type { CompatibilityHost, ExtensionContext } from "@thinkbrain/core";

import type { DesktopExtensionContext } from "./desktopExtensionHost";

/** The extension API version this host implements. */
export const HOST_API_VERSION = "1.0.0";

/**
 * The contribution surfaces `DesktopExtensionContext` layers over the core
 * `ExtensionContext` — every context key an extension can register or call
 * into, minus the lifecycle fields (`extensionId`, `subscriptions`).
 */
type ContributionSurface = Exclude<keyof DesktopExtensionContext, keyof ExtensionContext>;

/**
 * The capabilities the host advertises, keyed so each name is a real surface.
 *
 * `satisfies Record<ContributionSurface, true>` checks both directions at
 * compile time: a misspelled key is a type error, and a surface added to
 * `DesktopExtensionContext` without a key here fails the `Record` — the list
 * cannot silently drift from the context it describes.
 */
const CONTRIBUTION_SURFACES = {
  commands: true,
  panels: true,
  editorHooks: true,
  editorHeaders: true,
  tabs: true,
  events: true,
  workspace: true,
  settings: true
} as const satisfies Record<ContributionSurface, true>;

/** The descriptor every extension is evaluated against. */
export const HOST_COMPATIBILITY: CompatibilityHost = {
  apiVersion: HOST_API_VERSION,
  platform: "desktop",
  capabilities: Object.keys(CONTRIBUTION_SURFACES)
};
