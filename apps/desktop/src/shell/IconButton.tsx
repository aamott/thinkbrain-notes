import { cn } from "../lib/utils";

/**
 * Reusable activity bar icon button.
 *
 * Renders a full-width square button with a left accent border that highlights
 * when active. Used by the left and right activity bars in the desktop shell.
 */
export function IconButton({
  label,
  symbol,
  active,
  className,
  onClick
}: {
  label: string;
  symbol: string;
  active?: boolean;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center w-full h-10 border-0 border-l-2 border-l-transparent bg-transparent text-activitybar-foreground cursor-pointer text-[1.1rem] hover:bg-[color-mix(in_srgb,var(--tn-color-accent)_60%,transparent)] hover:text-activitybar-active",
        active && "bg-[color-mix(in_srgb,var(--tn-color-accent)_60%,transparent)] text-activitybar-active border-l-activitybar-active",
        className
      )}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <span aria-hidden="true">{symbol}</span>
    </button>
  );
}
