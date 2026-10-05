import { cn } from "../../lib/utils";

/**
 * The small danger count chip shared by the phone chrome — bubble corners,
 * the header's menu button, drawer rows.
 *
 * One size everywhere (`text-[0.65rem]`): the chip is a glance signal, and
 * three hand-rolled sizes had already drifted. Positioning is the caller's —
 * pass `absolute …` classes when the chip overlays its owner.
 *
 * Always `aria-hidden`: the count must ride the owner's accessible name
 * (e.g. "Home, 3 conflicts"), or a screen reader would announce a bare number.
 */
export function CountBadge({
  count,
  className
}: {
  readonly count: number;
  readonly className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "rounded-full bg-danger px-1.5 text-[0.65rem] font-bold text-danger-foreground",
        className
      )}
    >
      {count}
    </span>
  );
}
