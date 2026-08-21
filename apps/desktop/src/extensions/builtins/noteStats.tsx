/* eslint-disable react-refresh/only-export-components -- activation function is intentionally exported alongside a local component */
import type { DesktopPanelContext } from "../../panels/panelRegistryModel";
import type { DesktopExtensionContext } from "../desktopExtensionHost";
import { computeNoteStats, FALLBACK_WPM } from "./noteStats";

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
    icon: "sum",
    side: "right",
    factory: (panelContext: DesktopPanelContext) => {
      // Null check first: no point computing stats when no note is open.
      if (panelContext.documentContents === null) {
        return (
          <div className="p-4">
            <p className="m-0 text-muted-foreground text-xs">
              Open a Markdown note to see its statistics.
            </p>
          </div>
        );
      }

      const wordsPerMinute = context.settings.get<number>("wordsPerMinute") ?? FALLBACK_WPM;
      const showReadingTime = context.settings.get<boolean>("showReadingTime") ?? true;
      const stats = computeNoteStats(panelContext.documentContents, wordsPerMinute);

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
