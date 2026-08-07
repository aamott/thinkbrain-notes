import type { ExtensionManifest } from "@thinkbrain/core";

import type { DesktopPanelContext } from "../../panels/panelRegistry";
import type { DesktopExtensionContext } from "../desktopExtensionHost";

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
const FALLBACK_WPM = 200;

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
    panels: [{ id: "stats", label: "Note Stats", icon: "∑", side: "right" }]
  }
};

function StatRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-baseline justify-between py-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-foreground text-sm tabular-nums">{value}</span>
    </div>
  );
}

/** Activates Note Stats. Every registration is owned by `context.subscriptions`. */
export function activateNoteStats(context: DesktopExtensionContext): void {
  context.settings.registerSchema({
    label: "Note Stats",
    scope: "app",
    sections: [
      {
        id: "display",
        label: "Display",
        settings: [
          {
            key: "showReadingTime",
            type: "boolean",
            default: true,
            scope: "app",
            section: "display",
            label: "Show reading time",
            description: "Include an estimated reading time in the Note Stats panel."
          },
          {
            key: "wordsPerMinute",
            type: "number",
            min: 50,
            max: 1000,
            default: FALLBACK_WPM,
            scope: "app",
            section: "display",
            label: "Reading speed",
            description: "Words per minute used to estimate reading time."
          }
        ]
      }
    ]
  });

  context.panels.register({
    id: "stats",
    label: "Note Stats",
    icon: "∑",
    side: "right",
    factory: (panelContext: DesktopPanelContext) => {
      const wordsPerMinute = context.settings.get<number>("wordsPerMinute") ?? FALLBACK_WPM;
      const showReadingTime = context.settings.get<boolean>("showReadingTime") ?? true;
      const stats = computeNoteStats(panelContext.documentContents, wordsPerMinute);

      if (panelContext.documentContents === null) {
        return (
          <div className="p-4">
            <p className="m-0 text-muted-foreground text-xs">
              Open a Markdown note to see its statistics.
            </p>
          </div>
        );
      }

      return (
        <div className="p-4" aria-label="Note statistics">
          <StatRow label="Words" value={String(stats.words)} />
          <StatRow label="Characters" value={String(stats.characters)} />
          {showReadingTime && (
            <StatRow
              label="Reading time"
              value={`${stats.readingMinutes} min`}
            />
          )}
        </div>
      );
    }
  });

  context.commands.register({
    id: "show",
    title: "Show note stats",
    keywords: ["word", "count", "characters", "reading"],
    availability: "available",
    handler: ({ revealPanel, closePalette }) => {
      revealPanel("note-stats.stats");
      closePalette();
    }
  });
}
