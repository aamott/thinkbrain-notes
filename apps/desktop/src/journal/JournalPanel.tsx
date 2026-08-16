import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent
} from "react";

import { listWindow, rowOffsets } from "../lib/listWindow";
import { ContextMenu, MenuButton, type ContextMenuState } from "../shell/ContextMenu";
import { EmptyState, JournalTrouble } from "./journalChrome";
import { Row } from "./JournalRow";
import { JournalPanelHeader } from "./JournalPanelHeader";
import type { JournalChip, JournalFacet, JournalPredicate } from "./journalFacets";

export type { JournalChip };
import {
  ESTIMATED_ROW_HEIGHTS,
  journalRowHeights,
  type JournalRow,
  type JournalRowHeights,
  type JournalView
} from "./journalViewModel";

/**
 * Rows drawn beyond each edge of the viewport.
 *
 * Enough that a flick of the wheel lands on a drawn row rather than on the gap
 * before the next render, and few enough that the saving is the point.
 */
const OVERSCAN = 4;

/**
 * Viewport assumed until the list has been laid out and can be asked.
 *
 * Only ever wrong for the first frame, and wrong in the safe direction: a
 * generous guess draws rows that turn out to be off screen, where a mean one
 * would leave the bottom of a short panel blank until the measurement landed.
 */
const ESTIMATED_VIEWPORT = 640;

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

export interface JournalPanelProps {
  readonly view: JournalView;
  readonly search: string;
  /** False when the platform index is unavailable (D16/D41). */
  readonly searchAvailable: boolean;
  /**
   * A transient action failure (rename/delete/create that did not take). Shown
   * as a banner so the user knows why their action was undone by the reload,
   * not just logged for the developer. Cleared by the container after a pause.
   */
  readonly actionError?: string | null;
  readonly chips: readonly JournalChip[];
  /** Fields and values the index found, for the filter menu (D41). */
  readonly facets?: readonly JournalFacet[];
  readonly predicates?: readonly JournalPredicate[];
  /** False when the index cannot answer; the filter says so rather than lying. */
  readonly filtersAvailable?: boolean;
  readonly onToggleFilter?: (predicate: JournalPredicate) => void;
  readonly onSearchChange: (value: string) => void;
  readonly onNewEntry: () => void;
  readonly onToday: () => void;
  readonly onOpenCalendar: () => void;
  readonly onOpenEntry: (relativePath: string) => void;
  /** Renames an entry. Omitted where the host cannot rename files. */
  readonly onRenameEntry?: (relativePath: string, newRelativePath: string) => void;
  /** Deletes an entry. Omitted where the host cannot delete files. */
  readonly onDeleteEntry?: (relativePath: string) => void;
  /**
   * The entries currently drawn, so their first lines can be read (D9).
   *
   * The panel is the only thing that knows which rows are on screen, and it
   * reports paths rather than indices so nothing upstream has to know how the
   * list is windowed. Called only when the set changes, never per frame.
   */
  readonly onVisibleEntriesChange?: (relativePaths: readonly string[]) => void;
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
// `rowName` and `Row` live in `JournalRow.tsx` — presentational, no panel state.

export function JournalPanel({
  view,
  search,
  searchAvailable,
  actionError,
  chips,
  facets = [],
  predicates = [],
  filtersAvailable = false,
  onToggleFilter = () => undefined,
  onSearchChange,
  onNewEntry,
  onToday,
  onOpenCalendar,
  onOpenEntry,
  onRenameEntry,
  onDeleteEntry,
  onVisibleEntriesChange,
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
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(ESTIMATED_VIEWPORT);
  const [rowHeights, setRowHeights] = useState<JournalRowHeights>(ESTIMATED_ROW_HEIGHTS);
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

  const offsets = useMemo(
    () => rowOffsets(journalRowHeights(view.rows, rowHeights)),
    [view.rows, rowHeights]
  );
  const drawn = listWindow(offsets, scrollTop, viewport, OVERSCAN);

  /**
   * Takes the viewport and one row of each kind from what was just laid out.
   *
   * Measured rather than assumed because a row's height is not ours to decide:
   * the coarse-pointer minimum (D76), the width tiers (D55/D72), the user's
   * font size and the platform's scrollbars all move it. Only rows inside the
   * window can be measured, so a kind currently scrolled out keeps its last
   * known height — right, since it had one when it was last drawn.
   *
   * Deliberately runs after every render rather than on a dependency list: what
   * it reads is the laid-out DOM, which no list of values describes. It settles
   * because it only sets state when a number actually changed, so the second
   * pass over an unchanged layout writes nothing and the chain stops.
   */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (list.clientHeight > 0 && list.clientHeight !== viewport) setViewport(list.clientHeight);

    const measure = (kind: string, fallback: number): number =>
      list.querySelector<HTMLElement>(`[data-row-kind="${kind}"]`)?.offsetHeight || fallback;
    const next: JournalRowHeights = {
      year: measure("year", rowHeights.year),
      month: measure("month", rowHeights.month),
      entry: measure("entry", rowHeights.entry)
    };
    if (
      next.year !== rowHeights.year ||
      next.month !== rowHeights.month ||
      next.entry !== rowHeights.entry
    ) {
      setRowHeights(next);
    }
  });

  /**
   * Re-measures when the panel is resized rather than re-rendered.
   *
   * Dragging the sidebar wider or the window taller changes how many rows fit
   * without changing a single prop, so nothing above would run: the list would
   * keep drawing a screenful for the height it had when it was first laid out,
   * leaving the bottom of a grown panel blank.
   */
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      setViewport((current) => (list.clientHeight > 0 ? list.clientHeight : current));
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, [view.state]);

  /**
   * Tells whoever is listening which entries are drawn, when that changes.
   *
   * Keyed on the paths themselves rather than the window's indices: collapsing
   * a group changes every index below it without changing which files are on
   * screen, and re-reading those files would be work for nothing.
   */
  const visibleEntries = useMemo(
    () =>
      view.rows
        .slice(drawn.startIndex, drawn.endIndex)
        .filter((row) => row.kind === "entry" || row.kind === "undated-entry")
        .map((row) => row.key),
    [view.rows, drawn.startIndex, drawn.endIndex]
  );
  const visibleKey = visibleEntries.join("\n");
  const reported = useRef<string | null>(null);
  useEffect(() => {
    if (visibleKey === reported.current) return;
    reported.current = visibleKey;
    onVisibleEntriesChange?.(visibleEntries);
  }, [visibleKey, visibleEntries, onVisibleEntriesChange]);

  /**
   * Puts the keyboard on the row the roving tabindex just moved to, once it has
   * been drawn.
   *
   * Focus cannot happen in the handler that moved it: past the edge of the
   * drawn slice there is no element yet, and a roving tabindex landing on
   * nothing drops the user out of the list. So the move scrolls, and this
   * claims the row on the render that scroll produced.
   */
  const wantsFocus = useRef(false);
  useLayoutEffect(() => {
    if (!wantsFocus.current) return;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-row-index="${focusedRow}"]`);
    if (!row) return;
    wantsFocus.current = false;
    row.focus();
  });

  const move = (delta: number): void => {
    const next = Math.min(Math.max(focusedRow + delta, 0), view.rows.length - 1);
    setFocusedRow(next);
    wantsFocus.current = true;

    const list = listRef.current;
    if (!list) return;
    const top = offsets[next] ?? 0;
    const bottom = offsets[next + 1] ?? top;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = bottom - list.clientHeight;
    }
    setScrollTop(list.scrollTop);
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
    <JournalPanelHeader
      view={view}
      search={search}
      searchAvailable={searchAvailable}
      chips={chips}
      facets={facets}
      predicates={predicates}
      filtersAvailable={filtersAvailable}
      onSearchChange={onSearchChange}
      onNewEntry={onNewEntry}
      onToday={onToday}
      onOpenCalendar={onOpenCalendar}
      onToggleFilter={onToggleFilter}
      onRemoveChip={onRemoveChip}
      onClearFilters={onClearFilters}
    />
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
            onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
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
            {/*
              The rows outside the window are not drawn, so these stand in for
              their height. Without them the scrollbar would measure a screenful
              instead of the list, and scrolling would end after one page.
            */}
            <div aria-hidden="true" data-list-space="leading" style={{ height: drawn.leadingSpace }} />
            {view.rows.slice(drawn.startIndex, drawn.endIndex).map((row, offset) => {
              const index = drawn.startIndex + offset;
              return (
                <Row
                  key={row.key}
                  row={row}
                  index={index}
                  rowCount={view.rows.length}
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
              );
            })}
            <div
              aria-hidden="true"
              data-list-space="trailing"
              style={{ height: drawn.trailingSpace }}
            />
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
      {actionError && (
        // A rename/delete/create that failed used to vanish into the console:
        // the reload undid it and the user saw the row reappear with no clue
        // why. This banner is the user-facing half of "fail loudly" (AGENTS.md).
        <div
          role="alert"
          className="mx-2 mb-1.5 rounded-small border-l-[3px] border-l-danger bg-muted px-2 py-1.5 text-[0.7rem]"
        >
          <p className="m-0 font-semibold">That didn't work.</p>
          <p className="m-0 text-muted-foreground break-all">{actionError}</p>
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
            className="max-w-xs rounded-small border border-border bg-popover p-4 shadow-soft"
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
