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
  | "open-settings"
  | "rebuild-index"
  | "open-graph"
  | "open-source-control"
  | "open-extensions"
  | (string & {});

/** Retained metadata for integrations that still inspect the old command intent. */
export type DesktopCommandIntent =
  | { readonly type: "open-file" }
  | { readonly type: "new-note" }
  | { readonly type: "search" }
  | { readonly type: "toggle-theme" }
  | { readonly type: "toggle-panel"; readonly panel: "explorer" | "outline" | "assistant" | "bottom" }
  | { readonly type: "open-settings" }
  | { readonly type: "rebuild-index" }
  | { readonly type: "open-feature"; readonly feature: "graph" | "source-control" | "extensions" }
  | { readonly type: string };

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
  /** Optional compatibility metadata; execution always uses `handler`. */
  readonly intent?: DesktopCommandIntent;
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
  available({
    id: "open-file",
    title: "Open file",
    keywords: ["file", "note", "workspace"],
    keybinding: "Ctrl/Cmd+P",
    shortcut: "Ctrl/Cmd+P",
    intent: { type: "open-file" },
    handler: () => undefined
  }),
  available({
    id: "new-note",
    title: "New note",
    keywords: ["create", "markdown", "file"],
    intent: { type: "new-note" },
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
    intent: { type: "search" },
    handler: ({ openSearch, closePalette }) => {
      openSearch();
      closePalette();
    }
  }),
  available({
    id: "toggle-theme",
    title: "Toggle theme",
    keywords: ["dark", "light", "appearance"],
    intent: { type: "toggle-theme" },
    handler: ({ toggleTheme, closePalette }) => {
      toggleTheme();
      closePalette();
    }
  }),
  available({
    id: "toggle-explorer",
    title: "Toggle Explorer",
    keywords: ["sidebar", "files"],
    intent: { type: "toggle-panel", panel: "explorer" },
    handler: ({ toggleExplorer, closePalette }) => {
      toggleExplorer();
      closePalette();
    }
  }),
  available({
    id: "toggle-outline",
    title: "Toggle Outline",
    keywords: ["sidebar", "headings"],
    intent: { type: "toggle-panel", panel: "outline" },
    handler: ({ toggleOutline, closePalette }) => {
      toggleOutline();
      closePalette();
    }
  }),
  available({
    id: "toggle-assistant",
    title: "Toggle Assistant",
    keywords: ["chat", "agent", "ai"],
    intent: { type: "toggle-panel", panel: "assistant" },
    handler: ({ toggleAssistant, closePalette }) => {
      toggleAssistant();
      closePalette();
    }
  }),
  available({
    id: "toggle-bottom-panel",
    title: "Toggle bottom panel",
    keywords: ["terminal", "dock"],
    intent: { type: "toggle-panel", panel: "bottom" },
    handler: ({ toggleBottomPanel, closePalette }) => {
      toggleBottomPanel();
      closePalette();
    }
  }),
  available({
    id: "open-settings",
    title: "Open settings",
    keywords: ["preferences", "configuration"],
    intent: { type: "open-settings" },
    handler: ({ openSettings, closePalette }) => {
      openSettings();
      closePalette();
    }
  }),
  available({
    id: "rebuild-index",
    title: "Rebuild workspace index",
    keywords: ["search", "index", "refresh"],
    intent: { type: "rebuild-index" },
    handler: ({ rebuildIndex, closePalette }) => {
      rebuildIndex();
      closePalette();
    }
  }),
  unavailable({
    id: "open-graph",
    title: "Open graph",
    keywords: ["connections", "links"],
    intent: { type: "open-feature", feature: "graph" },
    prerequisite: "link indexing",
    unavailableMessage: "Graph is unavailable until link indexing is connected.",
    handler: () => undefined
  }),
  unavailable({
    id: "open-source-control",
    title: "Open source control",
    keywords: ["git", "changes", "commit"],
    intent: { type: "open-feature", feature: "source-control" },
    prerequisite: "source-control integration",
    unavailableMessage: "Source control is unavailable until Git integration is connected.",
    handler: () => undefined
  }),
  unavailable({
    id: "open-extensions",
    title: "Open extensions",
    keywords: ["plugins", "add-ons"],
    intent: { type: "open-feature", feature: "extensions" },
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
