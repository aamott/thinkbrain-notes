import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import {
  type PaletteItem,
  type WorkspaceFileResult,
  getCommandPaletteResults,
  handleCommandPaletteKey,
  initialCommandPaletteState,
  setCommandPaletteQuery,
  isCommandPaletteKey
} from "./commandPaletteModel";
import type { DesktopCommand } from "./commandRegistry";

export type { WorkspaceFileResult } from "./commandPaletteModel";

export interface CommandPaletteProps {
  readonly commands: readonly DesktopCommand[];
  readonly files: readonly WorkspaceFileResult[];
  readonly onClose: (restoreFocus?: boolean) => void;
  readonly onCommand: (command: DesktopCommand) => void;
  readonly onOpenFile: (file: WorkspaceFileResult) => void;
}

/** Accessible palette renderer over the typed command registry and workspace files. */
export function CommandPalette({ commands, files, onClose, onCommand, onOpenFile }: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState(initialCommandPaletteState);
  const [notice, setNotice] = useState<string | null>(null);

  const results = useMemo(
    () => getCommandPaletteResults(state, commands, files),
    [state, commands, files]
  );
  const { commandResults, fileResults, items, activeIndex } = results;

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
    if (!isCommandPaletteKey(event.key)) {
      return;
    }
    event.preventDefault();
    const decision = handleCommandPaletteKey(state, commands, files, event.key);
    setState(decision.state);
    if (decision.type === "close") {
      onClose();
    } else if (decision.type === "execute") {
      execute(decision.item);
    }
  };

  const trapFocus = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") return;
    event.preventDefault();
    inputRef.current?.focus();
  };

  return (
    <div className="fixed inset-0 z-10 flex items-start justify-center pt-[15vh] bg-overlay" role="presentation" onMouseDown={() => onClose()}>
      <section className="w-[min(38rem,calc(100vw-2rem))] overflow-hidden rounded-medium border border-border bg-popover shadow-soft" role="dialog" aria-modal="true" aria-label="Command palette" onKeyDown={trapFocus} onMouseDown={(event) => event.stopPropagation()}>
        <input ref={inputRef} className="w-full border-0 border-b border-border bg-transparent px-4 py-[0.85rem] text-[0.9rem] text-inherit outline-none focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring" value={state.query} onChange={(event) => { setState(setCommandPaletteQuery(event.target.value)); setNotice(null); }} onKeyDown={handleKeyDown} placeholder="Type a command or file name…" aria-label="Search commands" role="combobox" aria-expanded aria-controls="command-palette-results" aria-activedescendant={items[activeIndex]?.id} />
        {notice && <p className="m-0 border-b border-border bg-[color-mix(in_srgb,var(--tn-color-destructive)_8%,transparent)] px-[0.65rem] py-[0.45rem] text-[0.6875rem] text-danger" role="status">{notice}</p>}
        <div id="command-palette-results" className="max-h-[min(22rem,55vh)] overflow-auto p-[0.35rem]" role="listbox" aria-label="Palette results">
          {commandResults.length > 0 && <p className="m-0 px-[0.65rem] py-[0.45rem] text-[0.6875rem] font-bold uppercase tracking-[0.07em] text-muted-foreground">Commands</p>}
          {commandResults.map((command, index) => <PaletteOption key={command.id} id={`command-${command.id}`} active={index === activeIndex} disabled={command.availability === "unavailable"} onClick={() => execute({ id: `command-${command.id}`, kind: "command", command })}><span className="truncate">{command.title}</span><em className="flex-none text-[0.6875rem] not-italic text-muted-foreground">{command.availability === "unavailable" ? "Unavailable" : command.shortcut}</em></PaletteOption>)}
          {fileResults.length > 0 && <p className="m-0 px-[0.65rem] py-[0.45rem] text-[0.6875rem] font-bold uppercase tracking-[0.07em] text-muted-foreground">Files</p>}
          {fileResults.map((file, index) => <PaletteOption key={file.relativePath} id={`file-${file.relativePath}`} active={commandResults.length + index === activeIndex} onClick={() => execute({ id: `file-${file.relativePath}`, kind: "file", file })}><span className="truncate">{file.relativePath}</span><em className="flex-none text-[0.6875rem] not-italic text-muted-foreground">Markdown</em></PaletteOption>)}
          {!items.length && <p className="m-0 px-[0.65rem] py-[0.45rem] text-[0.6875rem] text-muted-foreground" role="status">No commands or Markdown files match “{state.query}”.</p>}
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
  return <button id={id} className={cn("flex w-full cursor-pointer items-center justify-between gap-4 rounded-small border-0 px-[0.65rem] py-[0.58rem] text-left text-[0.8125rem] text-foreground hover:bg-accent", active ? "bg-accent" : "bg-transparent", disabled && "opacity-[0.55]")} type="button" role="option" aria-selected={active} data-unavailable={disabled || undefined} onClick={onClick} tabIndex={-1}>{children}</button>;
}
