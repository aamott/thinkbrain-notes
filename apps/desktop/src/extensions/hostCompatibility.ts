/**
 * What this host offers an extension, for compatibility evaluation.
 *
 * Deliberately free of value imports. Both the bootstrap and the local-directory
 * loader gate against this descriptor, and the loader is itself consumed by the
 * bootstrap — importing it from `bootstrap.ts` would close an import cycle.
 *
 * Capabilities are compatibility hints, not permissions: an unsupported entry
 * produces a warning and the extension still loads.
 */

import type { CompatibilityHost } from "@thinkbrain/core";

/** The extension API version this host implements. */
export const HOST_API_VERSION = "1.0.0";

/** The descriptor every extension is evaluated against. */
export const HOST_COMPATIBILITY: CompatibilityHost = {
  apiVersion: HOST_API_VERSION,
  platform: "desktop",
  capabilities: ["commands", "panels", "editorHooks", "editorHeaders", "tabs", "events", "workspace", "settings"]
};
