/**
 * Activation event parsing.
 *
 * Extensions declare when they should load. Ids inside an event are relative to
 * the extension (`onCommand:show`, never `onCommand:note-stats.show`) because
 * the host owns prefixing.
 */

import type { ExtensionManifest } from "./manifest";

export type ActivationEvent =
  | { readonly kind: "startup" }
  | { readonly kind: "command"; readonly id: string }
  | { readonly kind: "view"; readonly id: string };

const RELATIVE_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/**
 * Parses one activation event string.
 *
 * @returns The parsed event, or `null` when the host does not support it.
 *   Unsupported events are ignored rather than fatal so that manifests written
 *   against a newer host still load here.
 */
export function parseActivationEvent(raw: string): ActivationEvent | null {
  if (raw === "onStartup") return { kind: "startup" };

  const separator = raw.indexOf(":");
  if (separator < 0) return null;

  const prefix = raw.slice(0, separator);
  const id = raw.slice(separator + 1);
  if (!RELATIVE_ID_PATTERN.test(id)) return null;

  if (prefix === "onCommand") return { kind: "command", id };
  if (prefix === "onView") return { kind: "view", id };
  return null;
}

/** True when the extension asks to be activated as soon as the app starts. */
export function hasStartupActivation(manifest: ExtensionManifest): boolean {
  return manifest.activationEvents.some((event) => parseActivationEvent(event)?.kind === "startup");
}
