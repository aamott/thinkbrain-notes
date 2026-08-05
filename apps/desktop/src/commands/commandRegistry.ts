/**
 * Renderer-neutral command metadata. The shell owns effects: a command only
 * describes the user intent it emits when selected from a palette, shortcut,
 * or future menu surface.
 */
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

export type CommandAvailability = "available" | "unavailable";

export interface DesktopCommand {
  readonly id: DesktopCommandId;
  readonly title: string;
  /** Extra searchable terms; these are never shown as renderer copy. */
  readonly keywords?: readonly string[];
  readonly shortcut?: string;
  readonly intent: DesktopCommandIntent;
  readonly availability: CommandAvailability;
  /** User-facing explanation for a command deliberately not yet wired. */
  readonly unavailableMessage?: string;
  /** Capability that must exist before an unavailable command becomes usable. */
  readonly prerequisite?: string;
}

export interface DesktopCommandRegistry {
  register(command: DesktopCommand): void;
  get(id: DesktopCommandId): DesktopCommand | undefined;
  entries(): readonly DesktopCommand[];
}

const available = <T extends Omit<DesktopCommand, "availability">>(command: T): T & {
  readonly availability: "available";
} => ({ ...command, availability: "available" });

const unavailable = <T extends Omit<DesktopCommand, "availability">>(command: T): T & {
  readonly availability: "unavailable";
} => ({ ...command, availability: "unavailable" });

/** First-party command ownership and availability are explicit and testable. */
export const builtInDesktopCommands: readonly DesktopCommand[] = [
  available({
    id: "open-file",
    title: "Open file",
    keywords: ["file", "note", "workspace"],
    shortcut: "Ctrl/Cmd+P",
    intent: { type: "open-file" }
  }),
  available({
    id: "new-note",
    title: "New note",
    keywords: ["create", "markdown", "file"],
    intent: { type: "new-note" }
  }),
  available({
    id: "search",
    title: "Search workspace",
    keywords: ["find", "full text"],
    shortcut: "Ctrl/Cmd+Shift+F",
    intent: { type: "search" }
  }),
  available({
    id: "toggle-theme",
    title: "Toggle theme",
    keywords: ["dark", "light", "appearance"],
    intent: { type: "toggle-theme" }
  }),
  available({
    id: "toggle-explorer",
    title: "Toggle Explorer",
    keywords: ["sidebar", "files"],
    intent: { type: "toggle-panel", panel: "explorer" }
  }),
  available({
    id: "toggle-outline",
    title: "Toggle Outline",
    keywords: ["sidebar", "headings"],
    intent: { type: "toggle-panel", panel: "outline" }
  }),
  available({
    id: "toggle-assistant",
    title: "Toggle Assistant",
    keywords: ["chat", "agent", "ai"],
    intent: { type: "toggle-panel", panel: "assistant" }
  }),
  available({
    id: "toggle-bottom-panel",
    title: "Toggle bottom panel",
    keywords: ["terminal", "dock"],
    intent: { type: "toggle-panel", panel: "bottom" }
  }),
  available({
    id: "open-settings",
    title: "Open settings",
    keywords: ["preferences", "configuration"],
    intent: { type: "open-settings" }
  }),
  available({
    id: "rebuild-index",
    title: "Rebuild workspace index",
    keywords: ["search", "index", "refresh"],
    intent: { type: "rebuild-index" }
  }),
  unavailable({
    id: "open-graph",
    title: "Open graph",
    keywords: ["connections", "links"],
    intent: { type: "open-feature", feature: "graph" },
    prerequisite: "link indexing",
    unavailableMessage: "Graph is unavailable until link indexing is connected."
  }),
  unavailable({
    id: "open-source-control",
    title: "Open source control",
    keywords: ["git", "changes", "commit"],
    intent: { type: "open-feature", feature: "source-control" },
    prerequisite: "source-control integration",
    unavailableMessage: "Source control is unavailable until Git integration is connected."
  }),
  unavailable({
    id: "open-extensions",
    title: "Open extensions",
    keywords: ["plugins", "add-ons"],
    intent: { type: "open-feature", feature: "extensions" },
    prerequisite: "extension host",
    unavailableMessage: "Extensions are unavailable until the extension host is connected."
  })
];

export function createDesktopCommandRegistry(
  initialCommands: readonly DesktopCommand[] = builtInDesktopCommands
): DesktopCommandRegistry {
  const commands = new Map<DesktopCommandId, DesktopCommand>();

  const registry: DesktopCommandRegistry = {
    register(command) {
      if (commands.has(command.id)) {
        throw new Error(`Command '${command.id}' is already registered.`);
      }
      commands.set(command.id, command);
    },
    get(id) {
      return commands.get(id);
    },
    entries() {
      return [...commands.values()];
    }
  };

  initialCommands.forEach((command) => registry.register(command));
  return registry;
}
