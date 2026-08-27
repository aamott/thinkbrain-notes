import { cn } from "../../lib/utils";

/**
 * Dimmed backdrop behind an overlay surface.
 *
 * Presentational and inert to assistive tech — the surface it sits behind owns
 * the dialog semantics. Tapping it dismisses. Always rendered so it can fade
 * in/out via CSS transitions, but `visibility: hidden` when closed so it is
 * fully removed from hit-testing (unlike `pointer-events: none`, which some
 * mobile WebViews do not honour reliably when multiple stacked elements share
 * the same z-index).
 *
 * `onPointerDown` is used instead of `onClick` because pointer events fire
 * earlier in the touch chain and are not subject to the 300ms click delay that
 * some WebViews still apply.
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
  return (
    <div
      aria-hidden="true"
      className={cn(
        "absolute inset-0 z-40 bg-overlay transition-[opacity,visibility] duration-[var(--tn-duration-overlay)] ease-out",
        open ? "visible opacity-100" : "invisible opacity-0",
        className
      )}
      onPointerDown={(event) => {
        // Only dismiss for direct hits on the scrim itself, not for events
        // that bubbled up from children (the scrim has no children, but this
        // guards against future wrapping).
        if (event.target === event.currentTarget) onDismiss();
      }}
    />
  );
}
