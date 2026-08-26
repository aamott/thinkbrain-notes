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
          "absolute inset-y-0 left-0 z-50 flex w-[86%] max-w-75 flex-col overflow-y-auto bg-sidebar text-sidebar-foreground shadow-panel",
          className
        )}
      >
        {children}
      </div>
    </>
  );
}
