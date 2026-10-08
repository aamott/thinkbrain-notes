/* eslint-disable react-refresh/only-export-components -- activation function is intentionally exported alongside a local component */
import { useSyncExternalStore } from "react";

import type { DesktopPanelContext } from "../../panels/panelRegistryModel";
import type { DesktopExtensionContext } from "../desktopExtensionHost";
import { computeNoteStats, FALLBACK_WPM } from "./noteStatsModel";

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

  /**
   * Re-reads a setting whenever it changes.
   *
   * Nothing re-renders a mounted panel when a setting changes — the factory
   * only re-runs when the panel's context props change — so a value edited in
   * Settings stayed invisible on the open panel until something else happened
   * to re-render it. Subscribing through the extension API keeps the panel
   * honest about what is configured right now. The journal's
   * `useWatchedSetting` is the same pattern; `derive` runs inside the snapshot
   * getter so React sees a stable identity for the derived value.
   */
  function useWatchedSetting<T, U = T>(
    key: string,
    derive: (raw: T | undefined) => U
  ): U {
    return useSyncExternalStore(
      (onChange) => {
        const subscription = context.settings.onDidChange(key, onChange);
        return () => subscription.dispose();
      },
      () => derive(context.settings.get<T>(key))
    );
  }

  /**
   * The panel body. The factory is invoked as a plain function call by
   * `MountedPanel`, so the hooks that keep settings live must belong to a
   * child component it renders.
   */
  function StatsPanel({ contents }: { readonly contents: string | null }) {
    const wordsPerMinute = useWatchedSetting<number, number>(
      "wordsPerMinute",
      (raw) => raw ?? FALLBACK_WPM
    );
    const showReadingTime = useWatchedSetting<boolean, boolean>(
      "showReadingTime",
      (raw) => raw ?? true
    );

    // Null check first: no point computing stats when no note is open.
    if (contents === null) {
      return (
        <div className="p-4">
          <p className="m-0 text-muted-foreground text-xs">
            Open a Markdown note to see its statistics.
          </p>
        </div>
      );
    }

    const stats = computeNoteStats(contents, wordsPerMinute);

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

  context.panels.register({
    id: "stats",
    label: "Note Stats",
    icon: "sum",
    side: "right",
    factory: (panelContext: DesktopPanelContext) => (
      <StatsPanel contents={panelContext.documentContents} />
    )
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
