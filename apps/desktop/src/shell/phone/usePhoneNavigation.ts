import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { LeftPanel, RightPanel } from "../shellTypes";

declare global {
  interface Window {
    /** Android bridge: `MainActivity` asks JS whether hardware Back has an
     *  in-app step left. Returns true (and pops) above the root, false at it. */
    __thinkbrainHandleAndroidBack?: () => boolean;
  }
}

/**
 * The phone chrome's content route: the Files home, one revealed left panel,
 * or one open tab.
 */
export type PhoneRoute =
  | { readonly kind: "files" }
  | { readonly kind: "panel"; readonly panel: LeftPanel }
  | { readonly kind: "tab"; readonly tabId: string };

/**
 * A transient surface over the content route: the navigation drawer, the tab
 * switcher, the action-items menu, or an inspector drawer. An inspector that
 * grew out of the actions menu records `parent: "actions"` so dismissing the
 * whole flow skips back over the menu entry it came from.
 */
export type PhoneOverlay =
  | { readonly kind: "navigation" }
  | { readonly kind: "tabs" }
  | { readonly kind: "actions" }
  | { readonly kind: "inspector"; readonly panel: RightPanel; readonly parent: "actions" | "content" };

export interface PhoneNavigation {
  readonly route: PhoneRoute;
  readonly overlay: PhoneOverlay | null;
  readonly depth: number;
  readonly canGoBack: boolean;
  /** Pushes `route` with no overlay. */
  readonly push: (route: PhoneRoute) => void;
  /** Replaces the current entry with `route` and no overlay. */
  readonly replace: (route: PhoneRoute) => void;
  /** Pushes the same route with `overlay` on top. */
  readonly openOverlay: (overlay: PhoneOverlay) => void;
  /** Pops the overlay; `wholeFlow` skips the actions entry under an inspector. */
  readonly dismissOverlay: (wholeFlow?: boolean) => void;
  readonly back: () => void;
}

/** History-state envelope. The marker distinguishes our entries from anything
 *  else sharing the same `window.history` (Vite client, OS gestures). */
interface PhoneNavState {
  readonly tnPhoneNav: true;
  readonly workspace: string | null;
  readonly route: PhoneRoute;
  readonly overlay: PhoneOverlay | null;
  readonly depth: number;
}

const filesRoute: PhoneRoute = { kind: "files" };

function sameRoute(a: PhoneRoute, b: PhoneRoute): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "panel" && b.kind === "panel") return a.panel === b.panel;
  if (a.kind === "tab" && b.kind === "tab") return a.tabId === b.tabId;
  return a.kind === "files";
}

function sameOverlay(a: PhoneOverlay | null, b: PhoneOverlay | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === "inspector" && b.kind === "inspector") {
    return a.panel === b.panel && a.parent === b.parent;
  }
  return a.kind !== "inspector";
}

function navState(
  workspace: string | null,
  route: PhoneRoute,
  overlay: PhoneOverlay | null,
  depth: number
): PhoneNavState {
  return { tnPhoneNav: true, workspace, route, overlay, depth };
}

/**
 * Browser-history-backed navigation for the phone chrome.
 *
 * Routes and overlays share one stack: opening a drawer, sheet, menu or
 * inspector pushes a real `history.pushState` entry naming that overlay, so
 * the Android WebView system Back and the visible Back dismiss the topmost
 * surface before touching content history — no native code. `window.history`
 * is shared, so only states carrying our marker *and* the current workspace
 * are trusted; anything else falls back to Files rather than trusting a
 * foreign shape.
 *
 * The workspace root keys every entry: switching workspaces reads as Files
 * (the entry's workspace no longer matches, so the current entry is derived,
 * not copied) and the reset effect stamps that root into history, so a pop
 * can never resurrect the previous vault's route.
 *
 * Callbacks read route/depth through refs updated at each transition: `push`
 * and `back` are stable across renders, and several pushes inside one React
 * batch see each other's depth.
 */
export function usePhoneNavigation(workspaceRoot: string | null): PhoneNavigation {
  const [entry, setEntry] = useState<PhoneNavState>(() => navState(workspaceRoot, filesRoute, null, 0));
  // An entry recorded under another workspace is not this workspace's route:
  // after a switch the chrome reads as Files until something pushes again.
  const current = entry.workspace === workspaceRoot ? entry : navState(workspaceRoot, filesRoute, null, 0);
  const route = current.route;
  const overlay = current.overlay;
  const depth = current.depth;
  const entryRef = useRef(current);

  // Cold mount and workspace change both start at Files. `replaceState` rather
  // than `pushState`: the root entry is not a visit, so it must not leave a
  // history entry Back could land on.
  useEffect(() => {
    window.history.replaceState(navState(workspaceRoot, filesRoute, null, 0), "");
    entryRef.current = navState(workspaceRoot, filesRoute, null, 0);
  }, [workspaceRoot]);

  // Android hardware-Back bridge. `WryActivity`'s default handler only walks
  // the WebView's *native* session history, which ignores pushState entries —
  // so `MainActivity` asks this function instead: above the root it steps back
  // (popstate then runs the same overlay-then-content restore), at the root it
  // declines and Android's normal Back behaviour (background/exit) applies.
  useEffect(() => {
    const handler = (): boolean => {
      if (entryRef.current.depth <= 0) return false;
      window.history.back();
      return true;
    };
    window.__thinkbrainHandleAndroidBack = handler;
    return () => {
      if (window.__thinkbrainHandleAndroidBack === handler) {
        delete window.__thinkbrainHandleAndroidBack;
      }
    };
  }, []);

  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      const s = event.state as Partial<PhoneNavState> | null;
      const next =
        s?.tnPhoneNav === true && s.workspace === workspaceRoot && s.route && typeof s.depth === "number"
          ? navState(workspaceRoot, s.route, s.overlay ?? null, s.depth)
          : navState(workspaceRoot, filesRoute, null, 0);
      entryRef.current = next;
      setEntry(next);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [workspaceRoot]);

  const push = useCallback(
    (next: PhoneRoute) => {
      if (sameRoute(entryRef.current.route, next) && entryRef.current.overlay === null) return;
      const nextDepth = entryRef.current.depth + 1;
      const state = navState(workspaceRoot, next, null, nextDepth);
      window.history.pushState(state, "");
      entryRef.current = state;
      setEntry(state);
    },
    [workspaceRoot]
  );

  const replace = useCallback(
    (next: PhoneRoute) => {
      const state = navState(workspaceRoot, next, null, entryRef.current.depth);
      window.history.replaceState(state, "");
      entryRef.current = state;
      setEntry(state);
    },
    [workspaceRoot]
  );

  const openOverlay = useCallback(
    (next: PhoneOverlay) => {
      const base = entryRef.current;
      if (sameOverlay(base.overlay, next)) return;
      const nextDepth = base.depth + 1;
      const state = navState(workspaceRoot, base.route, next, nextDepth);
      window.history.pushState(state, "");
      entryRef.current = state;
      setEntry(state);
    },
    [workspaceRoot]
  );

  const dismissOverlay = useCallback((wholeFlow = false) => {
    const current = entryRef.current;
    // An inspector drilled out of the actions menu sits two entries deep:
    // closing the flow skips the menu underneath it instead of reopening it.
    if (wholeFlow && current.overlay?.kind === "inspector" && current.overlay.parent === "actions") {
      window.history.go(-2);
      return;
    }
    if (current.depth > 0) window.history.back();
  }, []);

  const back = useCallback(() => {
    if (entryRef.current.depth > 0) window.history.back();
  }, []);

  // Memoized so consumers can depend on `navigation` in effects without
  // re-running on every unrelated render.
  return useMemo(
    () => ({ route, overlay, depth, canGoBack: depth > 0, push, replace, openOverlay, dismissOverlay, back }),
    [route, overlay, depth, push, replace, openOverlay, dismissOverlay, back]
  );
}
