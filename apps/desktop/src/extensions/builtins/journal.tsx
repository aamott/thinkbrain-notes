import { parseFrontmatter, type ExtensionManifest } from "@thinkbrain/core";
import { useSyncExternalStore } from "react";

import { JournalPanelContainer } from "../../journal/JournalPanelContainer";
import { createJournalService } from "../../journal/journalService";
import { journalSettingsSchema } from "../../journal/journalSettings";
import { registerJournalControls } from "../../journal/JournalFieldDefinitionsControl";
import { CalendarTabContainer } from "../../journal/CalendarTabContainer";
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

export function activateJournal(context: DesktopExtensionContext): void {
  context.settings.registerSchema(journalSettingsSchema);
  registerJournalControls();

  const service = createJournalService({
    workspace: context.workspace,
    // Read on every call rather than captured: the folder is workspace-scoped
    // (D45), so it changes under a running panel when the vault changes.
    root: () => context.settings.get<string>("root") ?? DEFAULT_ROOT,
    now: () => new Date()
  });

  const definitions = () =>
    parseFieldDefinitions(context.settings.get<string>("fieldDefinitions")).definitions;

  /**
   * D28: the widget belongs on a note in the journal folder, or on any note
   * that already carries one of the user's configured fields — those notes are
   * journal entries in every sense that matters, wherever they live.
   */
  const belongsHere = (relativePath: string | null, contents: string): boolean => {
    if (relativePath === null) return false;
    const root = context.settings.get<string>("root") ?? DEFAULT_ROOT;
    if (relativePath.startsWith(`${root}/`)) return true;
    const configured = definitions();
    if (configured.length === 0) return false;
    const metadata = parseFrontmatter(contents).metadata;
    return configured.some((definition) => metadata[definition.id] !== undefined);
  };

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

    return (
      <MetadataWidgetContainer
        relativePath={relativePath ?? ""}
        contents={contents}
        definitions={parseFieldDefinitions(raw).definitions}
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
    factory: () => (
      // `Open folder…` and `Open settings` are shell affordances the extension
      // API has no route to yet; the states render without them until it does.
      <JournalPanelContainer service={service} onOpenCalendar={openCalendar} />
    )
  });

  context.tabs.register({
    kind: "calendar",
    label: "Journal calendar",
    isAvailable: true,
    availability: "available",
    factory: () => (
      <CalendarTabContainer
        service={service}
        weekStartsOn={context.settings.get<string>("startOfWeek") === "monday" ? 1 : 0}
        initialView={context.settings.get<string>("calendarDefaultView") === "week" ? "week" : "month"}
        // D79/D80: the view persists per workspace; the date deliberately does
        // not, since the month you browsed to is an accident of browsing.
        onViewChange={(view) => {
          void context.settings.set("calendarDefaultView", view);
        }}
      />
    )
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
