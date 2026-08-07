import {
  createContributionRegistry,
  type CommandContribution,
  type ContributionRegistry
} from "@thinkbrain/core";

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
  | "open-source-control"
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
}

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

/** First-party command ownership and availability are explicit and testable. */
export const builtInDesktopCommands: readonly DesktopCommand[] = [
  unavailable({
    id: "open-file",
    title: "Open file",
    keywords: ["file", "note", "workspace"],
    keybinding: "Ctrl/Cmd+P",
    shortcut: "Ctrl/Cmd+P",
    prerequisite: "native file picker",
    unavailableMessage: "Open file is unavailable until the native file picker is connected.",
    handler: () => undefined
  }),
  available({
    id: "new-note",
    title: "New note",
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
    shortcut: "Ctrl/Cmd+Shift+F",
    handler: ({ openSearch, closePalette }) => {
      openSearch();
      closePalette();
    }
  }),
  available({
    id: "toggle-live-preview",
    title: "Toggle live preview",
    keywords: ["markdown", "wysiwyg", "preview", "source", "editor"],
    handler: ({ toggleLivePreview, closePalette }) => {
      toggleLivePreview();
      closePalette();
    }
  }),
  available({
    id: "toggle-theme",
    title: "Toggle theme",
    keywords: ["dark", "light", "appearance"],
    handler: ({ toggleTheme, closePalette }) => {
      toggleTheme();
      closePalette();
    }
  }),
  available({
    id: "toggle-explorer",
    title: "Toggle Explorer",
    keywords: ["sidebar", "files"],
    handler: ({ toggleExplorer, closePalette }) => {
      toggleExplorer();
      closePalette();
    }
  }),
  available({
    id: "toggle-outline",
    title: "Toggle Outline",
    keywords: ["sidebar", "headings"],
    handler: ({ toggleOutline, closePalette }) => {
      toggleOutline();
      closePalette();
    }
  }),
  available({
    id: "toggle-assistant",
    title: "Toggle Assistant",
    keywords: ["chat", "agent", "ai"],
    handler: ({ toggleAssistant, closePalette }) => {
      toggleAssistant();
      closePalette();
    }
  }),
  available({
    id: "toggle-bottom-panel",
    title: "Toggle bottom panel",
    keywords: ["terminal", "dock"],
    handler: ({ toggleBottomPanel, closePalette }) => {
      toggleBottomPanel();
      closePalette();
    }
  }),
  available({
    id: "open-settings",
    title: "Open settings",
    keywords: ["preferences", "configuration"],
    handler: ({ openSettings, closePalette }) => {
      openSettings();
      closePalette();
    }
  }),
  available({
    id: "rebuild-index",
    title: "Rebuild workspace index",
    keywords: ["search", "index", "refresh"],
    handler: ({ rebuildIndex, closePalette }) => {
      rebuildIndex();
      closePalette();
    }
  }),
  unavailable({
    id: "open-graph",
    title: "Open graph",
    keywords: ["connections", "links"],
    prerequisite: "link indexing",
    unavailableMessage: "Graph is unavailable until link indexing is connected.",
    handler: () => undefined
  }),
  unavailable({
    id: "open-source-control",
    title: "Open source control",
    keywords: ["git", "changes", "commit"],
    prerequisite: "source-control integration",
    unavailableMessage: "Source control is unavailable until Git integration is connected.",
    handler: () => undefined
  }),
  unavailable({
    id: "open-extensions",
    title: "Open extensions",
    keywords: ["plugins", "add-ons"],
    prerequisite: "extension host",
    unavailableMessage: "Extensions are unavailable until the extension host is connected.",
    handler: () => undefined
  })
];

export function createDesktopCommandRegistry(
  initialCommands: readonly DesktopCommand[] = builtInDesktopCommands
): DesktopCommandRegistry {
  return createContributionRegistry<DesktopCommand>(initialCommands);
}

/** Shared command registry consumed by the desktop shell and extension bootstrap. */
export const desktopCommandRegistry = createDesktopCommandRegistry();
