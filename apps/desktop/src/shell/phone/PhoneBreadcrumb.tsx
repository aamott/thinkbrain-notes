import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { useDismissable } from "@thinkbrain/ui";

import { cn } from "../../lib/utils";

/**
 * Browser-style location pill for the phone header.
 *
 * The pill's crumb row is right-aligned (`w-max` inside `justify-end`) so the
 * current file is always the visible end and clipped ancestors fall off the
 * left — where a gradient fade signals there is more. Tapping opens a compact
 * bubble with the same path in a natively scrollable row (touch drag, no
 * pointer physics), opened scrolled right so the file shows first.
 */
export function PhoneBreadcrumb({ segments }: { readonly segments: readonly string[] }) {
  const [open, setOpen] = useState(false);
  const [overflowed, setOverflowed] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const scrollRowRef = useRef<HTMLDivElement | null>(null);
  const { containerRef } = useDismissable({
    open,
    onDismiss: () => setOpen(false)
  });

  const crumbs = segments.filter((segment) => segment.length > 0);
  // Stable identity for the crumb list: `crumbs` is a fresh array every render,
  // so effect deps key on its contents, not its identity.
  const pathKey = crumbs.join("\u0000");

  const crumb = (segment: string, index: number) => {
    const current = index === crumbs.length - 1;
    return (
      <span key={index} className="flex items-center">
        {index > 0 && (
          <span aria-hidden="true" className="mx-1 text-muted-foreground">
            /
          </span>
        )}
        <span
          className={cn(
            "whitespace-nowrap",
            current ? "font-semibold text-foreground" : "text-muted-foreground"
          )}
        >
          {segment}
        </span>
      </span>
    );
  };

  // The fade only means "something is clipped": the row keeps its intrinsic
  // width via `w-max`, so offsetWidth wider than the viewport is the signal.
  const measure = useCallback(() => {
    const viewport = viewportRef.current;
    const row = rowRef.current;
    if (!viewport || !row) return;
    setOverflowed(row.offsetWidth > viewport.clientWidth);
  }, []);

  useLayoutEffect(() => {
    measure();
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    if (rowRef.current) observer.observe(rowRef.current);
    return () => observer.disconnect();
  }, [measure, pathKey]);

  // Opened scrolled to the current (rightmost) segment; dragging left walks
  // back into the ancestors.
  useLayoutEffect(() => {
    const row = scrollRowRef.current;
    if (open && row) row.scrollLeft = row.scrollWidth;
  }, [open, pathKey]);

  return (
    <div className="relative min-w-0 flex-1">
      <button
        type="button"
        aria-label="Current location"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex h-9 w-full cursor-pointer items-center rounded-full border border-border bg-surface px-3 text-sm tn-focus-ring"
        onClick={() => setOpen((v) => !v)}
      >
        <div ref={viewportRef} className="relative min-w-0 flex-1 overflow-hidden">
          <div ref={rowRef} className="flex w-max min-w-full items-center justify-end">
            {crumbs.map(crumb)}
          </div>
          {overflowed && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-surface to-transparent"
            />
          )}
        </div>
      </button>

      {open && (
        <>
          {/* Undimmed outside-dismiss layer: a floating bubble, not a sheet. */}
          <div
            aria-hidden="true"
            className="fixed inset-0 z-40"
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) setOpen(false);
            }}
          />
          <div
            ref={containerRef}
            role="dialog"
            aria-label="Full path"
            className="absolute left-1/2 top-[calc(100%+0.5rem)] z-50 w-max max-w-[min(85vw,24rem)] -translate-x-1/2 rounded-large border border-border bg-surface p-3 shadow-panel backdrop-blur-sm"
          >
            <div className="text-xs font-medium text-muted-foreground">Current location</div>
            <div
              ref={scrollRowRef}
              tabIndex={0}
              aria-label="Full path"
              className="mt-2 overflow-x-auto overscroll-x-contain touch-pan-x tn-focus-ring"
            >
              <div className="flex w-max items-center">{crumbs.map(crumb)}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
