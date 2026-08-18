import { cn } from "../lib/utils";
import { PanelIcon } from "./panelIcons";

/**
 * Reusable activity bar icon button.
 *
 * Renders a full-width square button with a left accent border that highlights
 * when active. Used by the left and right activity bars in the desktop shell.
 *
 * `symbol` is a panel icon identifier resolved through {@link PanelIcon}: a
 * known name renders a themed lucide svg; an unknown string (e.g. an
 * extension-shipped glyph like `◫`) renders as text so existing extensions
 * keep working. Lucide uses `stroke="currentColor"`, so the icon inherits the
 * button's `text-activitybar-foreground` / `text-activitybar-active` color
 * without a dedicated icon color token.
 *
 * An optional `badge` puts a count over the icon — how many things are waiting
 * behind a panel nobody has opened yet.
 */
export function IconButton({
  label,
  symbol,
  active,
  badge,
  className,
  onClick
}: {
  label: string;
  symbol: string;
  active?: boolean;
  /**
   * A count to show over the icon, when there is something to count.
   *
   * Folded into the accessible name rather than left as a decoration, because
   * a number nobody reads out is a number screen-reader users do not have.
   */
  badge?: number;
  className?: string;
  onClick: () => void;
}) {
  const named = badge ? `${label} (${badge})` : label;
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center w-full h-10 border-0 border-l-2 border-l-transparent bg-transparent text-activitybar-foreground cursor-pointer text-[1.1rem] hover:bg-[color-mix(in_srgb,var(--tn-color-accent)_60%,transparent)] hover:text-activitybar-active",
        active && "bg-[color-mix(in_srgb,var(--tn-color-accent)_60%,transparent)] text-activitybar-active border-l-activitybar-active",
        className
      )}
      onClick={onClick}
      aria-label={named}
      aria-current={active ? "true" : undefined}
      title={named}
    >
      <span aria-hidden="true" className="relative inline-flex items-center justify-center [&>svg]:w-[1.05rem] [&>svg]:h-[1.05rem] [&>svg]:stroke-current">
        <PanelIcon name={symbol} />
        {badge ? (
          <span
            aria-hidden="true"
            className="absolute -right-2.5 -top-1 min-w-4 rounded-full bg-primary px-1 text-center text-[0.6rem] leading-4 text-primary-foreground"
          >
            {badge}
          </span>
        ) : null}
      </span>
    </button>
  );
}
