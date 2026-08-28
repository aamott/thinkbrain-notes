import {
  createContributionRegistry,
  type CommandContribution,
  type ContributionRegistry
} from "@thinkbrain/core";
import { useMemo, useSyncExternalStore } from "react";
import { usePlatformCapabilities } from "../native/platformCapabilities";

/** Stable command identifiers owned by the desktop shell or an extension. */
export type DesktopCommandId =
  | "open-file"
  | "new-note"
  | "search"
  | "toggle-theme"
  | "toggle-explorer"
  | "toggle-outline"
  | "toggle-assistant"
  | "toggle-bottom-panel"
  | "toggle-live-preview"
  | "open-settings"
  | "rebuild-index"
  | "open-graph"
  | "open-extensions"
  | (string & {});

/** Effects supplied by the shell to a registered command handler. */
export interface DesktopCommandContext {
  readonly showExplorer: () => void;
  readonly focusNewNote: () => void;
  readonly openSearch: () => void;
  readonly toggleTheme: () => void;
  readonly toggleExplorer: () => void;
  readonly toggleOutline: () => void;
  readonly toggleAssistant: () => void;
  readonly toggleBottomPanel: () => void;
  readonly toggleLivePreview: () => void;
  /** Reveals a panel by its fully-qualified id, opening its side popout. */
  readonly revealPanel: (panelId: string) => void;
  /** Reveals a left-side panel (explorer, search, extensions). */
  readonly revealLeftPanel: (panelId: string) => void;
  readonly openSettings: () => void;
  readonly rebuildIndex: () => void;
  readonly closePalette: (restoreFocus?: boolean) => void;
}

export type CommandAvailability = "available" | "unavailable";

/** Desktop specialization of the platform-agnostic command contribution. */
export interface DesktopCommand
  extends CommandContribution<DesktopCommandContext> {
  readonly id: DesktopCommandId;
  /** Extra searchable terms; these are never shown as renderer copy. */
  readonly keywords?: readonly string[];
  /** Legacy palette display name; `keybinding` is the canonical field. */
  readonly shortcut?: string;
  readonly availability: CommandAvailability;
  /** User-facing explanation for a command deliberately not yet wired. */
  readonly unavailableMessage?: string;
  /** Capability that must exist before an unavailable command becomes usable. */
  readonly prerequisite?: string;
  /**
   * Platform capability required for this command to be available. When the
   * capability is absent, the command is shown as unavailable with a
   * platform-appropriate message. Omit for commands that work everywhere.
   */
  readonly requires?: PlatformCapability;
}

/** Platform capabilities a command can declare a dependency on. */
export type PlatformCapability =
  | "canSpawnProcess" // terminal, ACP agent host
  | "hasKeychain" // sync credentials
  | "opensWorkspaceInNewWindow"; // multi-window workspace

export type DesktopCommandRegistry = ContributionRegistry<DesktopCommand>;

type DesktopCommandDefinition = Omit<DesktopCommand, "availability">;

const available = (command: DesktopCommandDefinition): DesktopCommand => ({
  ...command,
  availability: "available"
});

const unavailable = (command: DesktopCommandDefinition): DesktopCommand => ({
  ...command,
  availability: "unavailable"
});

type NoArgContextAction = Exclude<{
  [Key in keyof DesktopCommandContext]: DesktopCommandContext[Key] extends () => void ? Key : never
}[keyof DesktopCommandContext], "closePalette">;

/** Runs a no-argument context action, then closes the palette. */
const withClosePalette = (action: NoArgContextAction) => (context: DesktopCommandContext): void => {
  context[action]();
  context.closePalette();
};

/** First-party command ownership and availability are explicit and testable. */
export const builtInDesktopCommands: readonly DesktopCommand[] = [
  unavailable({
    id: "open-file",
    title: "Open file",
    keywords: ["file", "note", "workspace"],
    keybinding: "Ctrl/Cmd+P",
    prerequisite: "native file picker",
    unavailableMessage: "Open file is unavailable until the native file picker is connected.",
    handler: () => undefined
  }),
  available({
    id: "new-note",
    title: "New note",
    icon: "plus",
    keywords: ["create", "markdown", "file"],
    handler: ({ showExplorer, focusNewNote, closePalette }) => {
      showExplorer();
      focusNewNote();
      closePalette(false);
    }
  }),
  available({
    id: "search",
    title: "Search workspace",
    keywords: ["find", "full text"],
    keybinding: "Ctrl/Cmd+Shift+F",
    handler: withClosePalette("openSearch")
  }),
  available({
    id: "toggle-live-preview",
    title: "Toggle live preview",
    keywords: ["markdown", "wysiwyg", "preview", "source", "editor"],
    handler: withClosePalette("toggleLivePreview")
  }),
  available({
    id: "toggle-theme",
    title: "Toggle theme",
    keywords: ["dark", "light", "appearance"],
    handler: withClosePalette("toggleTheme")
  }),
  available({
    id: "toggle-explorer",
    title: "Toggle Files",
    keywords: ["sidebar", "files"],
    handler: withClosePalette("toggleExplorer")
  }),
  available({
    id: "toggle-outline",
    title: "Toggle Outline",
    keywords: ["sidebar", "headings"],
    handler: withClosePalette("toggleOutline")
  }),
  available({
    id: "toggle-assistant",
    title: "Toggle Assistant",
    keywords: ["chat", "agent", "ai"],
    handler: withClosePalette("toggleAssistant")
  }),
  available({
    id: "toggle-bottom-panel",
    title: "Toggle bottom panel",
    keywords: ["terminal", "dock"],
    // The terminal dock needs process spawning, which is desktop-only.
    requires: "canSpawnProcess",
    handler: withClosePalette("toggleBottomPanel")
  }),
  available({
    id: "open-settings",
    title: "Open settings",
    keywords: ["preferences", "configuration"],
    handler: withClosePalette("openSettings")
  }),
  available({
    id: "rebuild-index",
    title: "Rebuild workspace index",
    keywords: ["search", "index", "refresh"],
    handler: withClosePalette("rebuildIndex")
  }),
  unavailable({
    id: "open-graph",
    title: "Open graph",
    keywords: ["connections", "links"],
    prerequisite: "link indexing",
    unavailableMessage: "Graph is unavailable until link indexing is connected.",
    handler: () => undefined
  }),
  available({
    id: "open-extensions",
    title: "Open extensions",
    keywords: ["plugins", "add-ons"],
    handler: ({ revealLeftPanel, closePalette }) => {
      revealLeftPanel("extensions");
      closePalette();
    }
  })
];

export function createDesktopCommandRegistry(
  initialCommands: readonly DesktopCommand[] = builtInDesktopCommands
): DesktopCommandRegistry {
  return createContributionRegistry<DesktopCommand>(initialCommands);
}

/** Shared command registry consumed by the desktop shell and extension bootstrap. */
export const desktopCommandRegistry = createDesktopCommandRegistry();

/**
 * Subscribes a component to the registered commands, filtered by platform
 * capabilities.
 *
 * An extension loaded from disk registers its commands while the app is already
 * running, so the palette follows the registry rather than reading it once.
 * Commands with a `requires` field whose platform capability is absent are
 * downgraded to `unavailable` so the palette shows them greyed-out with a
 * message rather than silently failing when invoked.
 */
export function useDesktopCommands(): readonly DesktopCommand[] {
  const raw = useSyncExternalStore(
    desktopCommandRegistry.subscribe,
    desktopCommandRegistry.entries,
    desktopCommandRegistry.entries
  );
  const capabilities = usePlatformCapabilities((s) => s.capabilities);

  return useMemo(() => {
    return raw.map((command) => {
      if (!command.requires) return command;
      if (capabilities[command.requires]) return command;
      return {
        ...command,
        availability: "unavailable" as const,
        unavailableMessage: command.unavailableMessage ?? "This command is not available on this platform."
      };
    });
  }, [raw, capabilities]);
}
