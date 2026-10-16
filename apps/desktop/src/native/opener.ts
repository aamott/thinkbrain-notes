import { openUrl as openUrlWithOs } from "@tauri-apps/plugin-opener";

import { normalizeNativeError } from "./commands";

/**
 * Hands a URL to the OS — the browser for `https:`, the mail client for
 * `mailto:`. The only door renderer link clicks take to anything outside the
 * vault; errors surface as typed `NativeCommandError`s like every other
 * native failure.
 */
export async function openUrl(url: string): Promise<void> {
  try {
    await openUrlWithOs(url);
  } catch (error) {
    const normalized = normalizeNativeError(error);
    console.error(`[native] opener.open_url failed: [${normalized.code}] ${normalized.message}`);
    throw normalized;
  }
}
