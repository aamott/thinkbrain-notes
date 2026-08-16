/**
 * The app-wide local-extension controller reference.
 *
 * Value-import free for the same reason as `bootstrapRef`: the Extensions panel
 * is reachable from the panel registry, and importing the controller's module
 * directly would close an import cycle through the registries.
 */

import type { LocalExtensions } from "./localExtensions";

let controller: LocalExtensions | null = null;

/** Publishes the app-wide controller. Only startup should call this. */
export function setLocalExtensions(next: LocalExtensions | null): void {
  controller = next;
}

/** Returns the app-wide controller, or `null` before startup has run. */
export function getLocalExtensions(): LocalExtensions | null {
  return controller;
}
