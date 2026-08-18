import type { ExtensionManifest } from "@thinkbrain/core";

/**
 * Note Stats — the first built-in extension.
 *
 * It exists to prove the extension platform end to end: a manifest, lazy
 * activation, a panel, a command, and namespaced settings, all cleaned up by
 * the activation's disposable scope. It deliberately contributes no editor
 * hook, because nothing it does needs one.
 */

export interface NoteStats {
  readonly words: number;
  readonly characters: number;
  readonly readingMinutes: number;
}

/** Words per minute used when the setting is missing or nonsensical. */
export const FALLBACK_WPM = 200;

/**
 * Counts a document.
 *
 * @param contents Document text, or `null` when no note is open.
 * @param wordsPerMinute Reading speed; non-positive values fall back so a
 *   misconfigured setting cannot produce Infinity or NaN.
 */
export function computeNoteStats(contents: string | null, wordsPerMinute: number): NoteStats {
  const text = contents ?? "";
  const trimmed = text.trim();
  const words = trimmed.length === 0 ? 0 : trimmed.split(/\s+/).filter(Boolean).length;
  const rate = Number.isFinite(wordsPerMinute) && wordsPerMinute > 0 ? wordsPerMinute : FALLBACK_WPM;

  return {
    words,
    characters: text.length,
    readingMinutes: words === 0 ? 0 : Math.ceil(words / rate)
  };
}

export const noteStatsManifest: ExtensionManifest = {
  id: "note-stats",
  name: "Note Stats",
  version: "1.0.0",
  apiVersion: "^1.0.0",
  engines: { platform: ["desktop", "mobile"] },
  activationEvents: ["onCommand:show", "onView:stats"],
  capabilities: [],
  contributes: {
    commands: [{ id: "show", title: "Show note stats" }],
    panels: [{ id: "stats", label: "Note Stats", icon: "sum", side: "right" }]
  }
};
