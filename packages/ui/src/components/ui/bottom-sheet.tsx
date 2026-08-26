import type { ReactNode } from "react";

import { cn } from "../../lib/utils";
import { Scrim } from "./scrim";
import { useDismissable } from "./use-dismissable";

/**
 * Bottom-anchored overlay surface.
 *
 * Capped at 80% height so the surface underneath stays partly visible — the
 * sheet is about the document you can still see, not a new screen.
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
  if (!open) return null;
  return (
    <>
      <Scrim open onDismiss={onDismiss} />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={cn(
          "absolute inset-x-0 bottom-0 z-50 flex max-h-[80%] flex-col overflow-y-auto rounded-t-lg bg-panel text-panel-foreground pb-[env(safe-area-inset-bottom)] shadow-panel",
          className
        )}
      >
        {children}
      </div>
    </>
  );
}
