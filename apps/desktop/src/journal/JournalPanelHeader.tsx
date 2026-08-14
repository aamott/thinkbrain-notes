import { ACTION, TOUCH } from "./journalChrome";
import type { JournalView } from "./journalViewModel";

/** One dismissible active filter (D60). */
export interface JournalChip {
  readonly id: string;
  readonly label: string;
}

/**
 * Journal panel header: actions, search, and the active-filter chip row (D71/D75).
 *
 * Presentational — every action is a prop. Extracted from `JournalPanel` so the
 * panel file stays under the 500-line preferred limit.
 */
export function JournalPanelHeader({
  view,
  search,
  searchAvailable,
  chips,
  onSearchChange,
  onNewEntry,
  onToday,
  onOpenCalendar,
  onRemoveChip,
  onClearFilters
}: {
  readonly view: JournalView;
  readonly search: string;
  readonly searchAvailable: boolean;
  readonly chips: readonly JournalChip[];
  readonly onSearchChange: (value: string) => void;
  readonly onNewEntry: () => void;
  readonly onToday: () => void;
  readonly onOpenCalendar: () => void;
  readonly onRemoveChip: (id: string) => void;
  readonly onClearFilters: () => void;
}) {
  return (
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
        {/* The "Filter" button is omitted until facets ship: a permanently
            disabled button with a count badge that can never appear is a dead
            affordance, and the panel's own D-pattern says a button that does
            nothing is worse than no button (line 87). The active-filter count
            stays visible above while the chip row carries the dismissals. */}
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
}
