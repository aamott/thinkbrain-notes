import { useRef, useState } from "react";

import { Menu, MenuCheckbox, type MenuPosition } from "../shell/Menu";
import { ACTION } from "./journalChrome";
import { predicateId, type JournalFacet, type JournalPredicate } from "./journalFacets";

/**
 * The metadata filter (D16/D41), right-aligned in its row (D73).
 *
 * Values are the ones the index actually found, never a list we keep: the
 * vocabulary is the user's (D4), so a field they stopped configuring still
 * offers the values their old entries carry (D45).
 *
 * Every value is one menu item named `field value`, which is both what the chip
 * says when it is on and what a screen reader reads (D31). The field headings
 * are decoration — a name that leaned on them would leave the item announcing
 * "good" with nothing to say what is good.
 */

/** Why the control is dead, said out loud rather than left to be guessed (D41). */
const UNAVAILABLE = "Filters need the search index, which isn't ready.";

export interface JournalFilterControlProps {
  readonly facets: readonly JournalFacet[];
  readonly predicates: readonly JournalPredicate[];
  /** False while the index cannot answer; the control says so rather than lying. */
  readonly available: boolean;
  readonly onToggle: (predicate: JournalPredicate) => void;
}

export function JournalFilterControl({
  facets,
  predicates,
  available,
  onToggle
}: JournalFilterControlProps) {
  const [anchor, setAnchor] = useState<MenuPosition | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const active = new Set(predicates.map(predicateId));
  const count = predicates.length;
  // A field the index found no values for has nothing to offer, and an empty
  // heading reads as a bug.
  const shown = facets.filter((facet) => facet.values.length > 0);

  // An index that goes away mid-choice takes the menu with it. Adjusted during
  // render rather than in an effect, which would draw one frame of a menu whose
  // values nothing can act on.
  if (!available && anchor !== null) setAnchor(null);

  const close = (): void => {
    setAnchor(null);
    // The menu took focus on open; dropping it on the body would strand a
    // keyboard user at the top of the document.
    trigger.current?.focus();
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        disabled={!available}
        title={available ? undefined : UNAVAILABLE}
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        // The count belongs in the name, not only in the badge (D31).
        aria-label={
          count === 0
            ? "Filter entries"
            : `Filter entries, ${count} filter${count === 1 ? "" : "s"} active`
        }
        onClick={() => {
          if (anchor !== null) {
            close();
            return;
          }
          const rect = trigger.current?.getBoundingClientRect();
          setAnchor({ x: rect?.left ?? 0, y: (rect?.bottom ?? 0) + 4 });
        }}
        className={`${ACTION} inline-flex items-center gap-1 disabled:opacity-60 disabled:cursor-default`}
      >
        Filter
        {count > 0 && (
          <span
            aria-hidden="true"
            className="rounded-small bg-primary px-1 text-[0.6rem] font-semibold text-primary-foreground"
          >
            {count}
          </span>
        )}
      </button>

      {anchor !== null && (
        <Menu at={anchor} anchorRef={trigger} onClose={close}>
          {shown.length === 0 && (
            <p className="m-0 px-3 py-1 text-xs text-muted-foreground">No metadata values yet.</p>
          )}
          {shown.map((facet) => (
            <div key={facet.key}>
              <p
                aria-hidden="true"
                className="m-0 px-3 pt-1 text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {facet.label}
              </p>
              {facet.values.map((value) => (
                <MenuCheckbox
                  key={predicateId({ key: facet.key, value })}
                  label={`${facet.label} ${value}`}
                  checked={active.has(predicateId({ key: facet.key, value }))}
                  onClick={() => onToggle({ key: facet.key, value })}
                />
              ))}
            </div>
          ))}
        </Menu>
      )}
    </>
  );
}
