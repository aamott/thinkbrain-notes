/**
 * Runtime environment probes for the native host.
 *
 * Every "are we inside Tauri" question answers through `isNativeHost`, so
 * feature code never imports `@tauri-apps/api` just to detect its own
 * environment. The check delegates to Tauri's `isTauri` on each call rather
 * than caching: tests stub the global and expect later calls to see the new
 * answer, and there is no startup ordering worth protecting.
 */

import { isTauri } from "@tauri-apps/api/core";

/** True when running inside the Tauri native host (not a plain browser). */
export function isNativeHost(): boolean {
  return isTauri();
}

/**
 * True on Apple platforms (macOS, iOS), where the shortcut modifier reads ⌘.
 *
 * Matches the historical `navigator.userAgent`/`navigator.platform` check —
 * it predates `userAgentData` support and still has to work in WebKitGTK, so
 * it stays a string sniff rather than an API capability check. Evaluated per
 * call so tests can restub `navigator`.
 */
export function isApplePlatform(): boolean {
  return (
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent || navigator.platform || "")
  );
}
