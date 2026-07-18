import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  filterDesktopCommands,
  initialCommandPaletteState,
  setCommandPaletteQuery
} from "./commandPaletteModel";
import type { DesktopCommand } from "./commandRegistry";
import styles from "./CommandPalette.module.css";

export interface WorkspaceFileResult {
  readonly rootPath: string;
  readonly relativePath: string;
}

export interface CommandPaletteProps {
  readonly commands: readonly DesktopCommand[];
  readonly files: readonly WorkspaceFileResult[];
  readonly onClose: (restoreFocus?: boolean) => void;
  readonly onCommand: (command: DesktopCommand) => void;
  readonly onOpenFile: (file: WorkspaceFileResult) => void;
}

type PaletteItem =
  | { readonly id: string; readonly kind: "command"; readonly command: DesktopCommand }
  | { readonly id: string; readonly kind: "file"; readonly file: WorkspaceFileResult };

/** Accessible palette renderer over the typed command registry and workspace files. */
export function CommandPalette({ commands, files, onClose, onCommand, onOpenFile }: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState(initialCommandPaletteState);
  const [notice, setNotice] = useState<string | null>(null);
  const commandResults = useMemo(() => filterDesktopCommands(commands, state.query), [commands, state.query]);
  const fileResults = useMemo(() => filterWorkspaceFiles(files, state.query), [files, state.query]);
  const items = useMemo<readonly PaletteItem[]>(() => [
    ...commandResults.map((command) => ({ id: `command-${command.id}`, kind: "command" as const, command })),
    ...fileResults.map((file) => ({ id: `file-${file.relativePath}`, kind: "file" as const, file }))
  ], [commandResults, fileResults]);
  const activeIndex = Math.min(state.activeIndex, Math.max(items.length - 1, 0));

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const execute = (item: PaletteItem | undefined) => {
    if (!item) return;
    if (item.kind === "file") {
      onOpenFile(item.file);
      onClose(false);
      return;
    }
    if (item.command.availability === "unavailable") {
      setNotice(item.command.unavailableMessage ?? "This command is unavailable.");
      return;
    }
    onCommand(item.command);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (!items.length || !["ArrowUp", "ArrowDown", "Home", "End", "Enter"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Enter") {
      execute(items[activeIndex]);
      return;
    }
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : event.key === "ArrowDown"
          ? (activeIndex + 1) % items.length
          : (activeIndex + items.length - 1) % items.length;
    setState((current) => ({ ...current, activeIndex: nextIndex }));
  };

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={() => onClose()}>
      <section className={styles.palette} role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(event) => event.stopPropagation()}>
        <input ref={inputRef} value={state.query} onChange={(event) => { setState(setCommandPaletteQuery(event.target.value)); setNotice(null); }} onKeyDown={handleKeyDown} placeholder="Type a command or file name…" aria-label="Search commands" aria-controls="command-palette-results" aria-activedescendant={items[activeIndex]?.id} />
        {notice && <p className={styles.notice} role="status">{notice}</p>}
        <div id="command-palette-results" className={styles.results} role="listbox" aria-label="Palette results">
          {commandResults.length > 0 && <p className={styles.groupLabel}>Commands</p>}
          {commandResults.map((command, index) => <PaletteOption key={command.id} id={`command-${command.id}`} active={index === activeIndex} disabled={command.availability === "unavailable"} onClick={() => execute({ id: `command-${command.id}`, kind: "command", command })}><span>{command.title}</span><em>{command.availability === "unavailable" ? "Unavailable" : command.shortcut}</em></PaletteOption>)}
          {fileResults.length > 0 && <p className={styles.groupLabel}>Files</p>}
          {fileResults.map((file, index) => <PaletteOption key={file.relativePath} id={`file-${file.relativePath}`} active={commandResults.length + index === activeIndex} onClick={() => execute({ id: `file-${file.relativePath}`, kind: "file", file })}><span>{file.relativePath}</span><em>Markdown</em></PaletteOption>)}
          {!items.length && <p className={styles.empty} role="status">No commands or Markdown files match “{state.query}”.</p>}
        </div>
      </section>
    </div>
  );
}

function PaletteOption({ id, active, disabled = false, onClick, children }: {
  readonly id: string;
  readonly active: boolean;
  readonly disabled?: boolean;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}) {
  return <button id={id} className={active ? styles.activeOption : styles.option} type="button" role="option" aria-selected={active} aria-disabled={disabled} onClick={onClick}>{children}</button>;
}

function filterWorkspaceFiles(files: readonly WorkspaceFileResult[], query: string): readonly WorkspaceFileResult[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return files.filter((file) => file.relativePath.toLowerCase().includes(needle));
}
