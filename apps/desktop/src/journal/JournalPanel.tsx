import { useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

import { ContextMenu, MenuButton, type ContextMenuState } from "../shell/ContextMenu";
import { ACTION, EmptyState, JournalTrouble, TOUCH } from "./journalChrome";
import type { JournalRow, JournalView } from "./journalViewModel";

/**
 * The journal popout: a navigator, never a writing surface (D9).
 *
 * Presentational by design — every action is a prop, so all fourteen states in
 * the approved mockup are reachable in a test rather than only through a
 * running workspace.
 *
 * Header order is D71/D75: the actions, then search, then the filter row.
 * Search sits with the filter and the results because the query and what it
 * returned are one group.
 */

/** One dismissible active filter (D60). */
export interface JournalChip {
  readonly id: string;
  readonly label: string;
}

export interface JournalPanelProps {
  readonly view: JournalView;
  readonly search: string;
  /** False when the platform index is unavailable (D16/D41). */
  readonly searchAvailable: boolean;
  readonly facetsAvailable: boolean;
  readonly chips: readonly JournalChip[];
  readonly onSearchChange: (value: string) => void;
  readonly onNewEntry: () => void;
  readonly onToday: () => void;
  readonly onOpenCalendar: () => void;
  readonly onOpenEntry: (relativePath: string) => void;
  /** Renames an entry. Omitted where the host cannot rename files. */
  readonly onRenameEntry?: (relativePath: string, newRelativePath: string) => void;
  /** Deletes an entry. Omitted where the host cannot delete files. */
  readonly onDeleteEntry?: (relativePath: string) => void;
  readonly onToggleGroup: (key: string) => void;
  readonly onRemoveChip: (id: string) => void;
  readonly onClearFilters: () => void;
  readonly onRetry: () => void;
  /**
   * Shell affordances the extension API does not expose yet. Omitted rather
   * than stubbed: a button that does nothing is worse than no button, and the
   * state's copy still names what went wrong.
   */
  readonly onChooseFolder?: () => void;
  readonly onOpenSettings?: () => void;
  readonly onCreateFolder: () => void;
}

/** A header's accessible name carries its count; the visible badge is not enough. */
function rowName(row: JournalRow): string {
  if (row.kind === "entry") {
    return row.timeLabel ? `${row.dateLabel}, ${row.timeLabel}` : `${row.dateLabel}`;
  }
  if (row.kind === "undated-entry") return row.label;
  const count = row.count ?? 0;
  return `${row.label}, ${count} ${count === 1 ? "entry" : "entries"}`;
}

function Row({
  row,
  focused,
  onActivate,
  onContextMenu,
  renaming,
  onRenameChange,
  onRenameCommit,
  onRenameCancel
}: {
  readonly row: JournalRow;
  readonly focused: boolean;
  readonly onActivate: () => void;
  readonly onContextMenu?: (event: ReactMouseEvent) => void;
  readonly renaming?: { draft: string };
  readonly onRenameChange?: (value: string) => void;
  readonly onRenameCommit?: () => void;
  readonly onRenameCancel?: () => void;
}) {
  const isHeader = row.collapsed !== null;
  const isRenaming = renaming !== undefined;
  const level = row.kind === "year" || row.kind === "undated" ? 1 : row.kind === "month" ? 2 : 3;

  // When renaming an entry row, render an inline input instead of the button.
  if (!isHeader && isRenaming) {
    return (
      <div className={`flex w-full items-center px-2 py-1 ${TOUCH} border-b border-border`}>
        <input
          autoFocus
          aria-label="Rename entry"
          value={renaming.draft}
          onChange={(e) => onRenameChange?.(e.target.value)}
          onBlur={onRenameCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); onRenameCommit?.(); }
            else if (e.key === "Escape") { e.preventDefault(); onRenameCancel?.(); }
          }}
          className="h-6 w-full rounded-small border border-input bg-background px-1.5 text-xs text-foreground"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      role="treeitem"
      aria-level={level}
      aria-label={rowName(row)}
      aria-expanded={isHeader ? !row.collapsed : undefined}
      tabIndex={focused ? 0 : -1}
      onClick={onActivate}
      onContextMenu={onContextMenu}
      className={
        isHeader
          ? row.kind === "year"
            ? `flex w-full items-center gap-1.5 px-2 py-1 ${TOUCH} bg-secondary border-t border-border text-[0.69rem] font-bold uppercase tracking-[0.12em] tabular-nums cursor-pointer text-left`
            : `flex w-full items-center gap-1.5 px-2 py-1 ${TOUCH} border-b border-border text-xs font-semibold cursor-pointer text-left`
          : `flex w-full flex-col justify-center gap-0.5 px-2 py-1 ${TOUCH} text-left cursor-pointer hover:bg-secondary`
      }
    >
      {isHeader ? (
        <>
          <span aria-hidden="true" className="text-[0.55rem] text-muted-foreground w-2">
            {row.collapsed ? "▸" : "▾"}
          </span>
          <span>{row.label}</span>
          {row.matchCount !== null ? (
            <span className="ml-auto rounded-full bg-accent px-1.5 text-[0.62rem] font-bold text-accent-foreground tabular-nums">
              {row.matchCount}
            </span>
          ) : (
            <span className="ml-auto text-[0.68rem] font-normal text-muted-foreground tabular-nums">
              {row.count}
            </span>
          )}
        </>
      ) : (
        <>
          <span className="flex items-baseline gap-1.5">
            <span className="text-xs font-semibold tabular-nums">{row.dateLabel ?? row.label}</span>
            {row.timeLabel && (
              <span className="text-[0.68rem] text-muted-foreground tabular-nums">
                {row.timeLabel}
              </span>
            )}
          </span>
          {/* Absent until the row is visible and its first line has loaded. */}
          {row.preview && (
            <span className="block truncate text-[0.72rem] text-muted-foreground">
              {row.preview}
            </span>
          )}
        </>
      )}
    </button>
  );
}

export function JournalPanel({
  view,
  search,
  searchAvailable,
  facetsAvailable,
  chips,
  onSearchChange,
  onNewEntry,
  onToday,
  onOpenCalendar,
  onOpenEntry,
  onRenameEntry,
  onDeleteEntry,
  onToggleGroup,
  onRemoveChip,
  onClearFilters,
  onRetry,
  onChooseFolder,
  onOpenSettings,
  onCreateFolder
}: JournalPanelProps) {
  const [focusedRow, setFocusedRow] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const [lastRowCount, setLastRowCount] = useState(view.rows.length);
  // Context menu for entry rows (right-click / long-press). Null when closed.
  const [contextMenu, setContextMenu] = useState<{ state: ContextMenuState; entryPath: string } | null>(null);
  // Inline rename state. Null when inactive.
  const [renaming, setRenaming] = useState<{ path: string; draft: string } | null>(null);
  // Delete confirmation. Null when inactive.
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  // Keep the roving focus inside the list when rows come and go, adjusting
  // during render rather than in an effect so no frame shows a stale index.
  if (view.rows.length !== lastRowCount) {
    setLastRowCount(view.rows.length);
    if (focusedRow >= view.rows.length) setFocusedRow(Math.max(0, view.rows.length - 1));
  }

  const move = (delta: number): void => {
    const next = Math.min(Math.max(focusedRow + delta, 0), view.rows.length - 1);
    setFocusedRow(next);
    const rows = listRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"]');
    rows?.[next]?.focus();
  };

  const activate = (row: JournalRow): void => {
    if (row.collapsed !== null) onToggleGroup(row.key);
    else if (renaming?.path === row.key) return; // Don't open while renaming.
    else onOpenEntry(row.key);
  };

  /** Opens the context menu for an entry row on right-click. */
  const showContextMenu = (event: ReactMouseEvent, entryPath: string): void => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ state: { x: event.clientX, y: event.clientY }, entryPath });
  };

  /** Commits a rename if the draft is valid and different. Only the filename
   *  is edited — the folder path is preserved. */
  const commitRename = (): void => {
    if (!renaming) return;
    const trimmed = renaming.draft.trim();
    const slash = renaming.path.lastIndexOf("/");
    const folder = slash >= 0 ? renaming.path.slice(0, slash + 1) : "";
    const currentName = slash >= 0 ? renaming.path.slice(slash + 1) : renaming.path;
    if (trimmed && trimmed !== currentName && onRenameEntry) {
      onRenameEntry(renaming.path, `${folder}${trimmed}`);
    }
    setRenaming(null);
  };

  const header = (
    <div className="flex flex-col gap-1.5 px-2 pb-2">
      <div className="flex items-stretch gap-1">
        <button
          type="button"
          aria-label="New journal entry"
          onClick={onNewEntry}
          className={`flex h-7 ${TOUCH} flex-1 min-w-0 items-center justify-center gap-1 rounded-small bg-primary text-primary-foreground text-xs font-semibold cursor-pointer`}
        >
          ＋ New entry
        </button>
        <button type="button" aria-label="Today" title="Today" onClick={onToday} className={`${ACTION} w-7 px-0`}>
          ◷
        </button>
        <button
          type="button"
          aria-label="Open journal calendar"
          title="Open calendar"
          onClick={onOpenCalendar}
          className={`${ACTION} w-7 px-0`}
        >
          ▦
        </button>
      </div>

      <input
        type="search"
        aria-label="Search entries"
        placeholder={searchAvailable ? "Search entries" : "Search unavailable"}
        value={search}
        disabled={!searchAvailable}
        onChange={(event) => onSearchChange(event.target.value)}
        className={`h-7 ${TOUCH} rounded-small border border-input bg-background px-2 text-xs text-foreground disabled:opacity-60`}
      />

      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {view.activeFilterCount > 0 && (
          <p role="status" className="m-0 mr-auto text-[0.68rem] font-semibold">
            Showing {view.showing.toLocaleString()}{" "}
            <span className="font-normal text-muted-foreground">
              of {view.total.toLocaleString()} entries
            </span>
          </p>
        )}
        <button
          type="button"
          disabled={!facetsAvailable}
          aria-label={
            view.activeFilterCount > 0
              ? `Filter entries, ${view.activeFilterCount} filters active`
              : "Filter entries"
          }
          className={`${ACTION} flex items-center gap-1.5 disabled:opacity-50`}
        >
          Filter
          {view.activeFilterCount > 0 && (
            <span className="grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[0.6rem] font-bold text-primary-foreground tabular-nums">
              {view.activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              aria-label={`Remove filter: ${chip.label}`}
              onClick={() => onRemoveChip(chip.id)}
              className={`flex items-center gap-1 rounded-small bg-accent px-1.5 py-0.5 ${TOUCH} text-[0.68rem] text-accent-foreground cursor-pointer`}
            >
              {chip.label}
              <span aria-hidden="true">✕</span>
            </button>
          ))}
          <button
            type="button"
            onClick={onClearFilters}
            className={`bg-transparent border-0 ${TOUCH} text-[0.68rem] text-muted-foreground underline underline-offset-2 cursor-pointer`}
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );

  const body = (): React.ReactNode => {
    switch (view.state) {
      case "no-workspace":
      case "invalid-root":
      case "unreadable":
        return (
          <JournalTrouble
            status={view.state}
            onRetry={onRetry}
            onChooseFolder={onChooseFolder}
            onOpenSettings={onOpenSettings}
          />
        );
      case "loading":
        return (
          <p aria-busy="true" className="m-0 px-3 py-4 text-xs text-muted-foreground">
            Reading the journal folder…
          </p>
        );
      case "empty":
        return (
          <EmptyState
            title="No entries yet."
            body="Your first one will be filed under the journal folder."
            actions={[
              { label: "＋ New entry", run: onNewEntry },
              { label: "Start journaling", run: onCreateFolder }
            ]}
          />
        );
      case "no-matches":
        return (
          <EmptyState
            title={`No entries match these ${view.activeFilterCount} filters.`}
            body="Every filter has to be true of the same entry, not just the same day."
            actions={[{ label: "Clear all filters", run: onClearFilters }]}
          />
        );
      case "list":
        return (
          <div
            ref={listRef}
            role="tree"
            aria-label="Journal entries"
            className="min-h-0 flex-1 overflow-auto"
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                move(1);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                move(-1);
              }
            }}
          >
            {view.rows.map((row, index) => (
              <Row
                key={row.key}
                row={row}
                focused={index === focusedRow}
                onActivate={() => activate(row)}
                onContextMenu={
                  row.collapsed === null && (onRenameEntry || onDeleteEntry)
                    ? (event) => showContextMenu(event, row.key)
                    : undefined
                }
                renaming={
                  row.collapsed === null && renaming?.path === row.key
                    ? { draft: renaming.draft }
                    : undefined
                }
                onRenameChange={(value) => setRenaming({ path: row.key, draft: value })}
                onRenameCommit={commitRename}
                onRenameCancel={() => setRenaming(null)}
              />
            ))}
          </div>
        );
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!searchAvailable && (
        <div className="mx-2 mb-1.5 rounded-small border-l-[3px] border-l-warning bg-muted px-2 py-1.5 text-[0.7rem]">
          <p className="m-0 font-semibold">Search is unavailable right now.</p>
          <p className="m-0 text-muted-foreground">
            Browsing and the date filter still work. Metadata filters need the index.
          </p>
        </div>
      )}
      {header}
      {body()}
      {contextMenu && (
        <ContextMenu state={contextMenu.state} onClose={() => setContextMenu(null)}>
          <MenuButton label="Open" onClick={() => { onOpenEntry(contextMenu.entryPath); setContextMenu(null); }} />
          {onRenameEntry && (
            <MenuButton label="Rename" onClick={() => {
              const slash = contextMenu.entryPath.lastIndexOf("/");
              const name = slash >= 0 ? contextMenu.entryPath.slice(slash + 1) : contextMenu.entryPath;
              setRenaming({ path: contextMenu.entryPath, draft: name });
              setContextMenu(null);
            }} />
          )}
          {onDeleteEntry && (
            <>
              <hr className="my-1 border-0 border-t border-border" />
              <MenuButton label="Delete" danger onClick={() => {
                setPendingDelete(contextMenu.entryPath);
                setContextMenu(null);
              }} />
            </>
          )}
        </ContextMenu>
      )}
      {pendingDelete && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/40"
          onClick={() => setPendingDelete(null)}
        >
          <div
            className="max-w-[20rem] rounded-small border border-border bg-popover p-4 shadow-soft"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="m-0 mb-1 text-sm font-semibold">Delete this entry?</p>
            <p className="m-0 mb-3 text-xs text-muted-foreground break-all">{pendingDelete}</p>
            <p className="m-0 mb-3 text-xs text-muted-foreground">This cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-small border border-border px-3 py-1 text-xs cursor-pointer hover:bg-secondary"
                onClick={() => setPendingDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-small bg-danger px-3 py-1 text-xs text-danger-foreground cursor-pointer"
                onClick={() => {
                  onDeleteEntry?.(pendingDelete);
                  setPendingDelete(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
