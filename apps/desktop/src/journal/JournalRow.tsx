import { type MouseEvent as ReactMouseEvent } from "react";

import { TOUCH } from "./journalChrome";
import { rowName } from "./journalRowUtils";
import { type JournalRow } from "./journalViewModel";

export function Row({
  row,
  index,
  rowCount,
  focused,
  onActivate,
  onContextMenu,
  renaming,
  onRenameChange,
  onRenameCommit,
  onRenameCancel
}: {
  readonly row: JournalRow;
  /** Position in the whole list, not in the drawn slice. */
  readonly index: number;
  readonly rowCount: number;
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
      // The rows outside the window are missing from the DOM, not from the
      // list. Without these a screen reader counts what it can see and tells
      // the user the list ends where the drawn slice does.
      aria-setsize={rowCount}
      aria-posinset={index + 1}
      data-row-index={index}
      data-row-kind={row.kind}
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
          {/*
            Always drawn, blank until the first line loads. A row that grew a
            line when its preview arrived would shove every row below it down
            mid-scroll, and the window is computed from row heights, so the
            list would be measuring itself against a shape it no longer has.
          */}
          <span className="block truncate text-[0.72rem] text-muted-foreground">
            {row.preview ?? "\u00a0"}
          </span>
        </>
      )}
    </button>
  );
}
