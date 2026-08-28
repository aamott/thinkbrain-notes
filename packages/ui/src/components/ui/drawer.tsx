import type { ReactNode } from "react";

import { cn } from "../../lib/utils";
import { Scrim } from "./scrim";
import { useDismissable } from "./use-dismissable";

/**
 * Edge-anchored navigation overlay.
 *
 * Deliberately narrower than the viewport (86%, capped at 300px): navigation
 * chrome peeks so it reads as something you tap out of, while content surfaces
 * take the full width. That contrast is the phone shell's main orientation cue.
 *
 * Always mounted so it can slide in/out via a CSS `transform` transition.
 * When closed it is translated fully off-screen and made invisible
 * (`visibility: hidden`, `aria-hidden`) so it neither captures input nor
 * appears in the a11y tree. Dialog semantics (`role` / `aria-modal`) are
 * applied only while open so they are not contradicted by `aria-hidden`.
 */
export function Drawer({
  open,
  onDismiss,
  label,
  className,
  children
}: {
  readonly open: boolean;
  readonly onDismiss: () => void;
  readonly label: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const { containerRef } = useDismissable({ open, onDismiss });
  return (
    <>
      <Scrim open={open} onDismiss={onDismiss} />
      <div
        ref={containerRef}
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
        aria-label={label}
        aria-hidden={!open}
        className={cn(
          // `pt-[env(safe-area-inset-top)]` pushes content below the phone's
          // status bar / notch. No-op on desktop (inset is 0 there). Mirrors
          // the same inset `PhoneHeader` applies; without it the drawer's
          // workspace name and long-press hint sit behind the time display.
          "absolute inset-y-0 left-0 z-50 flex w-[86%] max-w-75 flex-col overflow-y-auto bg-sidebar pt-[env(safe-area-inset-top)] text-sidebar-foreground shadow-panel tn-slide",
          open ? "visible translate-x-0" : "invisible -translate-x-full",
          className
        )}
      >
        {children}
      </div>
    </>
  );
}
