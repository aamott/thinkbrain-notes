import type { DesktopCommand } from "./commandRegistry";

export interface WorkspaceFileResult {
  readonly rootPath: string;
  readonly relativePath: string;
}

export type PaletteItem =
  | { readonly id: string; readonly kind: "command"; readonly command: DesktopCommand }
  | { readonly id: string; readonly kind: "file"; readonly file: WorkspaceFileResult };

export interface CommandPaletteState {
  readonly query: string;
  /** Index into the current filtered result set, never an absolute registry index. */
  readonly activeIndex: number;
}

export interface CommandPaletteResults {
  readonly commandResults: readonly DesktopCommand[];
  readonly fileResults: readonly WorkspaceFileResult[];
  readonly items: readonly PaletteItem[];
  readonly activeIndex: number;
  readonly activeItem: PaletteItem | null;
  readonly status: "results" | "empty";
}

export const COMMAND_PALETTE_KEYS = ["ArrowUp", "ArrowDown", "Home", "End", "Enter", "Escape"] as const;
export type CommandPaletteKey = typeof COMMAND_PALETTE_KEYS[number];

export function isCommandPaletteKey(key: string): key is CommandPaletteKey {
  return (COMMAND_PALETTE_KEYS as readonly string[]).includes(key);
}

export interface CommandPaletteKeyDecision {
  readonly state: CommandPaletteState;
  readonly type: "none" | "close" | "execute";
  readonly item?: PaletteItem;
}

export const initialCommandPaletteState: CommandPaletteState = {
  query: "",
  activeIndex: 0
};

/**
 * Filters command metadata without mutating registry order. Matching is
 * case-insensitive; title-prefix matches rank before other title/keyword hits.
 */
export function filterDesktopCommands(
  commands: readonly DesktopCommand[],
  query: string
): readonly DesktopCommand[] {
  const needle = normalize(query);
  if (!needle) return [...commands];

  return commands
    .map((command, index) => ({ command, index, score: commandMatchScore(command, needle) }))
    .filter((candidate): candidate is { readonly command: DesktopCommand; readonly index: number; readonly score: number } => candidate.score !== null)
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .map(({ command }) => command);
}

export function filterWorkspaceFiles(
  files: readonly WorkspaceFileResult[],
  query: string
): readonly WorkspaceFileResult[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return files.filter((file) => file.relativePath.toLowerCase().includes(needle));
}

export function getCommandPaletteResults(
  state: CommandPaletteState,
  commands: readonly DesktopCommand[],
  files: readonly WorkspaceFileResult[]
): CommandPaletteResults {
  const commandResults = filterDesktopCommands(commands, state.query);
  const fileResults = filterWorkspaceFiles(files, state.query);
  const items: readonly PaletteItem[] = [
    ...commandResults.map((command) => ({ id: `command-${command.id}`, kind: "command" as const, command })),
    ...fileResults.map((file) => ({ id: `file-${file.relativePath}`, kind: "file" as const, file }))
  ];
  const activeIndex = clampActiveIndex(state.activeIndex, items.length);
  return {
    commandResults,
    fileResults,
    items,
    activeIndex,
    activeItem: items[activeIndex] ?? null,
    status: items.length ? "results" : "empty"
  };
}

/** A query change always selects the first result, avoiding stale selection. */
export function setCommandPaletteQuery(query: string): CommandPaletteState {
  return { query, activeIndex: 0 };
}

/**
 * Applies keyboard navigation without touching the DOM or executing effects.
 * The renderer closes the dialog or dispatches the emitted command intent.
 */
export function handleCommandPaletteKey(
  state: CommandPaletteState,
  commands: readonly DesktopCommand[],
  files: readonly WorkspaceFileResult[],
  key: CommandPaletteKey
): CommandPaletteKeyDecision {
  const results = getCommandPaletteResults(state, commands, files);
  const count = results.items.length;

  if (key === "Escape") return { state: { ...state, activeIndex: results.activeIndex }, type: "close" };
  if (key === "Enter") {
    return results.activeItem
      ? { state: { ...state, activeIndex: results.activeIndex }, type: "execute", item: results.activeItem }
      : { state: { ...state, activeIndex: results.activeIndex }, type: "none" };
  }
  if (!count) return { state: { ...state, activeIndex: 0 }, type: "none" };

  const activeIndex = key === "Home"
    ? 0
    : key === "End"
      ? count - 1
      : key === "ArrowDown"
        ? (results.activeIndex + 1) % count
        : key === "ArrowUp"
          ? (results.activeIndex + count - 1) % count
          : results.activeIndex;

  return { state: { ...state, activeIndex }, type: "none" };
}

function commandMatchScore(command: DesktopCommand, needle: string): number | null {
  const title = normalize(command.title);
  if (title.startsWith(needle)) return 0;
  if (title.includes(needle)) return 1;
  if (command.keywords?.some((keyword) => normalize(keyword).includes(needle))) return 2;
  return null;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/g, " ");
}

function clampActiveIndex(activeIndex: number, resultCount: number): number {
  if (!resultCount) return 0;
  return Math.min(Math.max(activeIndex, 0), resultCount - 1);
}

