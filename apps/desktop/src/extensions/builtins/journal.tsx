import {
  normalizeRoot,
  parseFrontmatter,
  type ExtensionManifest
} from "@thinkbrain/core";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { JournalPanelContainer } from "../../journal/JournalPanelContainer";
import { createJournalService } from "../../journal/journalService";
import { journalSettingsSchema, parseFieldDefinitions } from "../../journal/journalSettings";
import { registerJournalControls } from "../../journal/JournalFieldDefinitionsControl";
import { CalendarTabContainer } from "../../journal/CalendarTabContainer";
import {
  journalFacetValues,
  journalMetadataMatches,
  queryMetadata,
  resolveWeekStart,
  searchJournalEntries
} from "../../journal/journalIndex";
import { useSearchIndexStore } from "../../search/searchIndexStore";
import { subscribeWorkspaceBridge } from "../workspaceBridge";
import { searchService } from "../../search/searchService";
import type { JournalFacet, JournalPredicate } from "../../journal/journalFacets";
import { useCollapsedGroups } from "../../journal/journalCollapse";
import { MetadataWidgetContainer } from "../../journal/MetadataWidgetContainer";
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
  // Warm (D65 revisited): the journal is a first-class surface, so it
  // activates at startup and its kept-mounted panel warms its listing while
  // hidden — every open is a reveal, never a load. The view/command events
  // stay as a retry path should the startup activation fail.
  activationEvents: [
    "onStartup",
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
    panels: [{ id: "journal", label: "Journal", icon: "notebook-pen", side: "left" }]
  }
};

/**
 * The journal's New-note popup contribution: a single row that runs the
 * canonical `today` command. Descriptor data only — the command keeps owning
 * the behavior, including its lazy activation.
 */
export const journalMobileNewNoteActions = [
  {
    id: "today",
    commandId: "today",
    label: "Today's journal",
    icon: "notebook-pen",
    requiresWorkspace: true
  }
] as const;

/** Default matches D64's `root`; used until the setting is read. */
const DEFAULT_ROOT = "journal";

export function activateJournal(context: DesktopExtensionContext): void {
  context.settings.registerSchema(journalSettingsSchema);
  context.subscriptions.add(registerJournalControls());

  /**
   * The configured root, read on every call rather than captured: the folder
   * is workspace-scoped (D45), so it changes under a running panel when the
   * vault changes. Raw — normalization is the caller's job, because a bad
   * value must reach `requireRoot` in the service to become an
   * `invalid-root` JournalError rather than a bare throw.
   */
  const configuredRoot = (): string =>
    context.settings.get<string>("root") ?? DEFAULT_ROOT;

  /** The configured root in canonical form. Throws on a value that escapes or is empty. */
  const journalRoot = (): string => normalizeRoot(configuredRoot());

  const service = createJournalService({
    workspace: context.workspace,
    root: configuredRoot,
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
   * `journalRoot` for the render path. `belongsHere` runs as `applies` inside
   * `EditorHeaderSlot`'s `useMemo`, so a `normalizeRoot` throw on an unusable
   * `root` setting (blank, or escaping the workspace) would take every open
   * editor tab down via `TabBoundary`. The service maps the same condition to
   * an `invalid-root` JournalError; here the safe answer is "not under the
   * journal folder" until the setting is fixed.
   */
  const safeJournalRoot = (): string | null => {
    try {
      return journalRoot();
    } catch {
      return null;
    }
  };

  /**
   * D28: the widget belongs on a note in the journal folder, or on any note
   * that already carries one of the user's configured fields — those notes are
   * journal entries in every sense that matters, wherever they live.
   */
  const belongsHere = (relativePath: string | null, contents: string): boolean => {
    if (relativePath === null) return false;
    const root = safeJournalRoot();
    if (root !== null && relativePath.startsWith(`${root}/`)) return true;
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
   * The watched raw field definitions, parsed and validated once per settings
   * change rather than on every re-render (which happens on every keystroke
   * in an open editor).
   */
  const useParsedDefinitions = () => {
    const raw = useWatchedSetting<string, string>("fieldDefinitions", (v) => v ?? "[]");
    return useMemo(() => parseFieldDefinitions(raw).definitions, [raw]);
  };

  function MetadataHeader({
    relativePath,
    contents,
    applyEdit
  }: {
    readonly relativePath: string | null;
    readonly contents: string;
    readonly applyEdit?: (next: string) => void;
  }) {
    const parsedDefinitions = useParsedDefinitions();

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
    icon: "notebook-pen",
    side: "left",
    showWorkspaceSelector: true,
    // Kept mounted once registered: the popout only hides it, so reopening is
    // a CSS toggle and the listing/state survive. Freshness comes from the
    // container's note-event subscriptions, not remounts.
    keepMounted: true,
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
    // D53: what the user collapsed outlives the panel, per workspace.
    const [collapsed, setCollapsed] = useCollapsedGroups("journal");

    // A kept-mounted panel has no remount to notice a workspace switch or a
    // changed `root` setting, so both feed the listing's key. The workspace
    // root comes from the bridge — the same source the service reads — and
    // the subscription fires inside the publish itself, where an effect
    // reading `panelContext.rootPath` could still see the stale root.
    const [bridgeRoot, setBridgeRoot] = useState(() => context.workspace.rootPath());
    useEffect(() => {
      const subscription = subscribeWorkspaceBridge((bridge) =>
        setBridgeRoot(bridge?.rootPath ?? null)
      );
      return () => void subscription.dispose();
    }, []);
    const rootSetting = useWatchedSetting<string, string>(
      "root",
      (raw) => raw ?? DEFAULT_ROOT
    );

    const searchEntries = useCallback(
      (query: string): Promise<ReadonlySet<string>> =>
        searchJournalEntries(searchService.search, indexRoot, journalRoot(), query),
      [indexRoot]
    );

    // The fields the user configured decide what there is to filter by; the
    // index decides which values those fields actually hold.
    const parsed = useParsedDefinitions();
    const loadFacets = useCallback(
      (): Promise<readonly JournalFacet[]> =>
        journalFacetValues(queryMetadata, indexRoot, journalRoot(), parsed),
      [indexRoot, parsed]
    );
    const matchEntries = useCallback(
      (predicates: readonly JournalPredicate[]): Promise<ReadonlySet<string>> =>
        journalMetadataMatches(queryMetadata, indexRoot, journalRoot(), predicates),
      [indexRoot]
    );

    return (
      // `Open folder…` and `Open settings` are shell affordances the extension
      // API has no route to yet; the states render without them until it does.
      <JournalPanelContainer
        service={service}
        // What the listing is of: this vault, this journal folder. A switch of
        // either re-reads; the workspace part matters because `root` is
        // workspace-scoped and can read the same on both sides of a switch.
        listKey={`${bridgeRoot ?? ""}${rootSetting}`}
        onOpenCalendar={openCalendar}
        indexAvailable={indexStatus === "ready"}
        searchEntries={searchEntries}
        loadFacets={loadFacets}
        matchEntries={matchEntries}
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
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
    factory: () => <CalendarTabRoot />
  });

  /**
   * Fail loudly: the service rejects with a JournalError (no workspace,
   * invalid root, unreadable folder) whose copy the journal panel already
   * renders — a discarded promise would only surface as console noise.
   * Revealing the panel to show that copy needs a left-panel reveal the
   * command context cannot express yet (see the open-calendar route).
   */
  const reportFailure = (what: string) => (error: unknown) => {
    console.error(`[journal] ${what} failed.`, error);
  };

  context.commands.register({
    id: "new-entry",
    title: "New journal entry",
    keywords: ["journal", "diary", "entry"],
    availability: "available",
    handler: ({ closePalette }) => {
      service.createEntry().catch(reportFailure("New journal entry"));
      closePalette();
    }
  });

  context.commands.register({
    id: "today",
    title: "Open today's journal entry",
    keywords: ["journal", "today", "diary"],
    availability: "available",
    handler: ({ closePalette }) => {
      service.openToday().catch(reportFailure("Open today's journal entry"));
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
