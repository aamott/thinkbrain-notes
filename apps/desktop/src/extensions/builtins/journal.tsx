import type { ExtensionManifest } from "@thinkbrain/core";

import { JournalPanelContainer } from "../../journal/JournalPanelContainer";
import { createJournalService } from "../../journal/journalService";
import { journalSettingsSchema } from "../../journal/journalSettings";
import { registerJournalControls } from "../../journal/JournalFieldDefinitionsControl";
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

  // Registered unavailable rather than omitted: the button in the popout then
  // leads somewhere that explains itself, instead of doing nothing.
  context.tabs.register({
    kind: "calendar",
    label: "Journal calendar",
    isAvailable: false,
    availability: "unavailable",
    unavailableMessage: "The journal calendar arrives with the calendar view."
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
