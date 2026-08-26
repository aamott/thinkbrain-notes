import { cn } from "../../lib/utils";

/**
 * Dimmed backdrop behind an overlay surface.
 *
 * Presentational and inert to assistive tech — the surface it sits behind owns
 * the dialog semantics. Tapping it dismisses.
 */
export function Scrim({
  open,
  onDismiss,
  className
}: {
  readonly open: boolean;
  readonly onDismiss: () => void;
  readonly className?: string;
}) {
  if (!open) return null;
  return (
    <div
      aria-hidden="true"
      className={cn("absolute inset-0 z-40 bg-overlay", className)}
      onClick={onDismiss}
    />
  );
}
