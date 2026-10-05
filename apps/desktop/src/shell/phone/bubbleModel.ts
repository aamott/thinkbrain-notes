import type { PhoneRoute } from "./usePhoneNavigation";

/** The floating-bubble identifiers, in their stable within-group order. */
export type BubbleId = "home" | "new-note" | "actions";

/** Everything {@link resolveBubbles} needs; computed once per PhoneShell render. */
export interface BubbleContext {
  readonly route: PhoneRoute;
  /** Active tab is a Markdown editor tab — only ever true on a tab route. */
  readonly viewingNote: boolean;
  /** Right-panel contributions whose `availability(rightContext)` is true
   *  (undefined availability = true). */
  readonly availableActionCount: number;
  /** Undismissed notifications aimed at a registered right panel. Keeps the
   *  Actions bubble on screen even when no panel resolves available — a
   *  notification with nowhere to be seen would be invisible on a phone. */
  readonly actionsBadge: number;
}

/** The resolved bubble layout: the left group in order, then the right. */
export interface ResolvedBubbles {
  readonly left: readonly BubbleId[];
  readonly right: readonly BubbleId[];
}

/**
 * Which floating bubbles the phone shell shows for the current context.
 *
 * Pure: every input arrives already computed so the visibility table stays a
 * function, not a second state source. `home` exists on every route except
 * Files (on Files the user is already home); `new-note` on Files and while a
 * Markdown note is on screen — the two places creating a note makes sense;
 * `actions` while at least one right panel resolves available or an
 * undismissed panel notification needs somewhere to be seen — an empty ⋮
 * menu is a dead button, but a badge is not.
 */
export function resolveBubbles(ctx: BubbleContext): ResolvedBubbles {
  const left: BubbleId[] = [];
  if (ctx.route.kind !== "files") left.push("home");
  if (ctx.route.kind === "files" || (ctx.route.kind === "tab" && ctx.viewingNote)) {
    left.push("new-note");
  }
  return {
    left,
    right: ctx.availableActionCount > 0 || ctx.actionsBadge > 0 ? ["actions"] : []
  };
}
