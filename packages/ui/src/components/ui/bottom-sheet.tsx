import type { ReactNode } from "react";

import { cn } from "../../lib/utils";
import { Scrim } from "./scrim";
import { useDismissable } from "./use-dismissable";

/**
 * Bottom-anchored overlay surface.
 *
 * Capped at 80% height so the surface underneath stays partly visible — the
 * sheet is about the document you can still see, not a new screen.
 *
 * Always mounted so it can slide up/down via a CSS `transform` transition.
 * When closed it is translated fully below the viewport and made inert.
 * Dialog semantics (`role` / `aria-modal`) are applied only while open so
 * they are not contradicted by `aria-hidden`.
 */
export function BottomSheet({
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
          "absolute inset-x-0 bottom-0 z-50 flex max-h-[80%] flex-col overflow-y-auto rounded-t-lg bg-panel text-panel-foreground pb-[env(safe-area-inset-bottom)] shadow-panel tn-slide",
          open ? "visible translate-y-0" : "invisible translate-y-full",
          className
        )}
      >
        {children}
      </div>
    </>
  );
}
