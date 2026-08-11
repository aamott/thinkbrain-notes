import { normalizeRoot, parseFrontmatter, type ExtensionManifest } from "@thinkbrain/core";
import { useCallback, useMemo, useSyncExternalStore } from "react";

import { JournalPanelContainer } from "../../journal/JournalPanelContainer";
import { createJournalService } from "../../journal/journalService";
import { journalSettingsSchema } from "../../journal/journalSettings";
import { registerJournalControls } from "../../journal/JournalFieldDefinitionsControl";
import { CalendarTabContainer } from "../../journal/CalendarTabContainer";
import { useSearchIndexStore } from "../../search/searchIndexStore";
import { searchService } from "../../search/searchService";
import { MetadataWidgetContainer } from "../../journal/MetadataWidgetContainer";
import { parseFieldDefinitions } from "../../journal/journalSettings";
import type { DesktopExtensionContext } from "../desktopExtensionHost";

/**
 * The journal, as a built-in extension.
 *
 * It uses the same extension API a third-party would (D68): the service reaches
 * the workspace through `context.workspace`, and the panel factory closes over
 * it. Nothing here reaches into the shell.
 *
 * Ids are fixed by D47 and must not drift — they appear in settings keys and in
 * saved workspace state.
 */

export const journalManifest: ExtensionManifest = {
  id: "journal-calendar",
  name: "Journal",
  version: "1.0.0",
  apiVersion: "^1.0.0",
  engines: { platform: ["desktop", "mobile"] },
  // Lazy (D65): the journal costs nothing until someone opens it or runs one
  // of its commands.
  activationEvents: [
    "onView:journal",
    "onCommand:new-entry",
    "onCommand:today",
    "onCommand:open-calendar"
  ],
  capabilities: [],
  contributes: {
    commands: [
      { id: "new-entry", title: "New journal entry" },
      { id: "today", title: "Open today's journal entry" },
      { id: "open-calendar", title: "Open journal calendar" }
    ],
    panels: [{ id: "journal", label: "Journal", icon: "◫", side: "left" }]
  }
};

/** Default matches D64's `root`; used until the setting is read. */
const DEFAULT_ROOT = "journal";

/**
 * Resolves the `startOfWeek` setting to a `WeekStart` (0=Sunday, 1=Monday).
 *
 * `"system"` defers to the OS locale's first day of week via `Intl.Locale`;
 * 1=Monday maps to 1, anything else (7=Sunday) maps to 0. Falls back to Sunday
 * if the locale info is unavailable.
 */
function resolveWeekStart(setting: string | undefined): 0 | 1 {
  if (setting === "monday") return 1;
  if (setting === "sunday") return 0;
  try {
    // `weekInfo` is not in the TS lib DOM types; cast to access it at runtime.
    const locale = new Intl.Locale(navigator.language) as Intl.Locale & {
      weekInfo?: { firstDay?: number };
    };
    return locale.weekInfo?.firstDay === 1 ? 1 : 0;
  } catch {
    return 0;
  }
}

export function activateJournal(context: DesktopExtensionContext): void {
  context.settings.registerSchema(journalSettingsSchema);
  registerJournalControls();

  const service = createJournalService({
    workspace: context.workspace,
    // Read on every call rather than captured: the folder is workspace-scoped
    // (D45), so it changes under a running panel when the vault changes.
    root: () => normalizeRoot(context.settings.get<string>("root") ?? DEFAULT_ROOT),
    now: () => new Date()
  });

  // Cache parsed field definitions so `belongsHere` and callbacks don't
  // re-parse JSON on every call. Updated via settings subscription.
  let cachedDefinitions = parseFieldDefinitions(
    context.settings.get<string>("fieldDefinitions")
  ).definitions;
  context.settings.onDidChange("fieldDefinitions", () => {
    cachedDefinitions = parseFieldDefinitions(
      context.settings.get<string>("fieldDefinitions")
    ).definitions;
  });
  const definitions = () => cachedDefinitions;

  /**
   * D28: the widget belongs on a note in the journal folder, or on any note
   * that already carries one of the user's configured fields — those notes are
   * journal entries in every sense that matters, wherever they live.
   */
  const belongsHere = (relativePath: string | null, contents: string): boolean => {
    if (relativePath === null) return false;
    const root = normalizeRoot(context.settings.get<string>("root") ?? DEFAULT_ROOT);
    if (relativePath.startsWith(`${root}/`)) return true;
    const configured = definitions();
    if (configured.length === 0) return false;
    const metadata = parseFrontmatter(contents).metadata;
    return configured.some((definition) => metadata[definition.id] !== undefined);
  };

  /**
   * Re-reads a setting whenever it changes.
   *
   * Nothing re-renders an open editor/tab when a setting changes, so a value
   * edited in Settings stayed invisible on the surface in front of you until
   * something else happened to re-render it. Subscribing through the extension
   * API keeps the consumer honest about what is configured right now.
   *
   * The snapshot is the raw value; callers are responsible for any mapping
   * (e.g. `resolveWeekStart`) — but the mapping must be applied inside the
   * `useSyncExternalStore` getSnapshot so React sees a stable identity for the
   * derived value, otherwise infinite render loops follow. For that reason the
   * hook accepts an optional `derive` callback that is invoked inside the
   * snapshot getter.
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
   * Re-reads the field definitions whenever they change.
   *
   * Nothing re-renders an open editor when a setting changes, so a field added
   * in Settings stayed invisible on the note in front of you until you happened
   * to type. Subscribing through the extension API keeps the widget honest
   * about what is configured right now.
   */
  const useDefinitions = () =>
    useSyncExternalStore(
      (onChange) => {
        const subscription = context.settings.onDidChange("fieldDefinitions", onChange);
        return () => subscription.dispose();
      },
      // A string snapshot, so React's identity check is the value's own.
      () => context.settings.get<string>("fieldDefinitions") ?? "[]"
    );

  function MetadataHeader({
    relativePath,
    contents,
    applyEdit
  }: {
    readonly relativePath: string | null;
    readonly contents: string;
    readonly applyEdit?: (next: string) => void;
  }) {
    const raw = useDefinitions();
    // Parse and validate field definitions once per settings change, not on
    // every editor re-render (which happens on every keystroke).
    const parsedDefinitions = useMemo(
      () => parseFieldDefinitions(raw).definitions,
      [raw]
    );

    return (
      <MetadataWidgetContainer
        relativePath={relativePath ?? ""}
        contents={contents}
        definitions={parsedDefinitions}
        applyEdit={applyEdit}
        // D85: promoting a key the note already uses is the one settings write
        // the editor makes, and only ever when the user asks for it by name.
        onDefineField={(field) => {
          const current = definitions();
          if (current.some((existing) => existing.id === field.id)) return;
          void context.settings.set(
            "fieldDefinitions",
            JSON.stringify([...current, field], null, 2)
          );
        }}
        // D84: adding a value to a select field's options grows the vocabulary
        // where the user says so. Only select fields have options to extend.
        onAddOption={(fieldId, option) => {
          const current = definitions();
          const target = current.find((existing) => existing.id === fieldId);
          if (!target || !target.options || target.options.includes(option)) return;
          const updated = current.map((existing) =>
            existing.id === fieldId
              ? { ...existing, options: [...existing.options!, option] }
              : existing
          );
          void context.settings.set(
            "fieldDefinitions",
            JSON.stringify(updated, null, 2)
          );
        }}
      />
    );
  }

  context.editorHeaders.register({
    id: "metadata-widget",
    label: "Entry metadata",
    applies: ({ relativePath, contents }) => belongsHere(relativePath, contents),
    render: ({ relativePath, contents, applyEdit }) => (
      <MetadataHeader
        relativePath={relativePath}
        contents={contents}
        applyEdit={applyEdit}
      />
    )
  });

  const openCalendar = (): void => {
    context.tabs.open("calendar", "Journal calendar");
  };

  context.panels.register({
    id: "journal",
    label: "Journal",
    icon: "◫",
    side: "left",
    // No PanelActions: D71 puts New entry, Today and Open calendar in the
    // panel's own action row, leaving the chrome row to the overflow alone.
    factory: () => <JournalPanelRoot />
  });

  /**
   * Reactive wrapper around {@link JournalPanelContainer} so the panel's search
   * follows the index's lifecycle.
   *
   * The panel owns no index of its own (D41): it asks this for matching paths
   * and filters its rows by the answer. Search stays unavailable until the
   * index reports ready, because an enabled box backed by a half-built index
   * would answer wrongly rather than not at all.
   */
  function JournalPanelRoot() {
    const indexStatus = useSearchIndexStore((state) => state.status.kind);
    const indexRoot = useSearchIndexStore((state) => state.rootPath);

    const searchEntries = useCallback(
      async (query: string): Promise<ReadonlySet<string>> => {
        if (indexRoot === null) return new Set();
        const hits = await searchService.search(indexRoot, query);
        return new Set(hits.map((hit) => hit.relativePath));
      },
      [indexRoot]
    );

    return (
      // `Open folder…` and `Open settings` are shell affordances the extension
      // API has no route to yet; the states render without them until it does.
      <JournalPanelContainer
        service={service}
        onOpenCalendar={openCalendar}
        indexAvailable={indexStatus === "ready"}
        searchEntries={searchEntries}
      />
    );
  }

  /**
   * Reactive wrapper around {@link CalendarTabContainer} so the calendar tab
   * re-reads `startOfWeek` and `calendarDefaultView` when they change in
   * Settings while the tab is open. The plain factory read both inline once at
   * mount, so adjusting either setting had no effect until the tab was closed
   * and reopened.
   */
  function CalendarTabRoot() {
    const weekStartsOn = useWatchedSetting<string, 0 | 1>("startOfWeek", (raw) =>
      resolveWeekStart(raw)
    );
    const initialView = useWatchedSetting<string, "week" | "month">(
      "calendarDefaultView",
      (raw) => (raw === "week" ? "week" : "month")
    );
    return (
      <CalendarTabContainer
        service={service}
        weekStartsOn={weekStartsOn}
        initialView={initialView}
        // D79/D80: the view persists per workspace; the date deliberately does
        // not, since the month you browsed to is an accident of browsing.
        onViewChange={(view) => {
          void context.settings.set("calendarDefaultView", view);
        }}
      />
    );
  }

  context.tabs.register({
    kind: "calendar",
    label: "Journal calendar",
    isAvailable: true,
    availability: "available",
    factory: () => <CalendarTabRoot />
  });

  context.commands.register({
    id: "new-entry",
    title: "New journal entry",
    keywords: ["journal", "diary", "entry"],
    availability: "available",
    handler: ({ closePalette }) => {
      void service.createEntry();
      closePalette();
    }
  });

  context.commands.register({
    id: "today",
    title: "Open today's journal entry",
    keywords: ["journal", "today", "diary"],
    availability: "available",
    handler: ({ closePalette }) => {
      void service.openToday();
      closePalette();
    }
  });

  context.commands.register({
    id: "open-calendar",
    title: "Open journal calendar",
    keywords: ["journal", "calendar", "month", "week"],
    availability: "available",
    handler: ({ revealPanel, closePalette }) => {
      revealPanel("journal-calendar.journal");
      openCalendar();
      closePalette();
    }
  });
}
