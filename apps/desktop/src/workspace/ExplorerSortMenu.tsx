import { ArrowUpDown } from "lucide-react";
import { useRef, useState } from "react";

import { cn } from "../lib/utils";
import { Menu, MenuRadio } from "../shell/Menu";
import { EXPLORER_SORT_OPTIONS, type ExplorerSortOrder } from "./explorerSort";
import { HEADER_ACTION_CLASSES } from "./workspaceExplorerTypes";

/**
 * The explorer header's sort control: an always-visible icon button that
 * opens a radio menu of the available orderings. Picking one applies it
 * (and persists it, via the action) and closes the menu.
 */
export function ExplorerSortMenu({
  sort,
  disabled = false,
  onSelect
}: {
  readonly sort: ExplorerSortOrder;
  readonly disabled?: boolean;
  readonly onSelect: (order: ExplorerSortOrder) => void;
}) {
  const [open, setOpen] = useState(false);
  // Same trigger rule as the ⋯ menu: without its anchor the closing press
  // counts as an outside click and the menu reopens in one gesture.
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        className={cn(HEADER_ACTION_CLASSES, open && "text-sidebar-foreground")}
        aria-label="Sort files"
        title="Sort"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <ArrowUpDown aria-hidden="true" />
      </button>
      {open && (
        <Menu
          label="Sort by"
          className="absolute right-0 top-full mt-1 z-50"
          anchorRef={buttonRef}
          onClose={() => setOpen(false)}
        >
          {EXPLORER_SORT_OPTIONS.map((option) => (
            <MenuRadio
              key={option.id}
              label={option.label}
              checked={option.id === sort}
              onClick={() => {
                setOpen(false);
                onSelect(option.id);
              }}
            />
          ))}
        </Menu>
      )}
    </div>
  );
}
