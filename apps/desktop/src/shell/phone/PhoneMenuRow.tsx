import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Touch-sized row shared by the Action items and New note phone menus. */
export function PhoneMenuRow({
  icon,
  label,
  detail,
  disabled = false,
  onSelect,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly detail?: ReactNode;
  readonly disabled?: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      aria-label={label}
      onClick={onSelect}
      className={cn(
        "flex min-h-11 w-full items-center gap-3 bg-transparent border-0 px-4 py-2 text-left text-sm cursor-pointer tn-focus-ring",
        disabled
          ? "cursor-not-allowed text-muted-foreground opacity-60"
          : "text-foreground hover:bg-muted"
      )}
    >
      <span className="inline-flex shrink-0 [&>svg]:size-4">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {detail != null && (
          <span className="block truncate text-xs text-muted-foreground">{detail}</span>
        )}
      </span>
    </button>
  );
}
