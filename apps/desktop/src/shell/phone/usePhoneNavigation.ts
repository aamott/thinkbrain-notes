import { dismissTopOverlay } from "@thinkbrain/ui";
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
 * A transient surface over the content route. Menus and launchers — the
 * navigation drawer, the tab switcher, the action-items menu, the New-note
 * popup — are ephemeral chrome state, never history entries, so Back dismisses
 * them and neither Back nor Forward can resurrect them. The inspector drawer
 * is the one destination-like overlay: it pushes a `history.pushState` entry
 * so system Back and the visible Back button dismiss it before content. An
 * inspector that grew out of the actions menu records `parent: "actions"` so
 * dismissing it restores the menu it came from.
 */
export type PhoneOverlay =
  | { readonly kind: "navigation" }
  | { readonly kind: "tabs" }
  | { readonly kind: "actions" }
  | { readonly kind: "new-note" }
  | { readonly kind: "inspector"; readonly panel: RightPanel; readonly parent: "actions" | "content" };

/** Ephemeral overlays: every kind except the history-backed inspector. */
type PhoneMenuOverlay = Exclude<PhoneOverlay, { readonly kind: "inspector" }>;
/** The only overlay a history entry can carry. */
type PhoneHistoryOverlay = Extract<PhoneOverlay, { readonly kind: "inspector" }>;

export interface PhoneNavigation {
  readonly route: PhoneRoute;
  readonly overlay: PhoneOverlay | null;
  readonly depth: number;
  /** Whether Back can dismiss ephemeral chrome or visit an earlier route. */
  readonly canGoBack: boolean;
  /** Whether the current browser-history branch has a later route or overlay. */
  readonly canGoForward: boolean;
  /** Pushes `route` with no overlay; pushing the current route just closes any open menu. */
  readonly push: (route: PhoneRoute) => void;
  /** Replaces the current entry with `route` and no overlay. */
  readonly replace: (route: PhoneRoute) => void;
  /** Opens `overlay`; menus stay ephemeral, while inspectors are pushed. */
  readonly openOverlay: (overlay: PhoneOverlay) => void;
  /** Opens over content, or swaps the currently open overlay in place. */
  readonly showOverlay: (overlay: PhoneOverlay) => void;
  /** Pops the overlay; `wholeFlow` skips restoring the menu under an inspector. */
  readonly dismissOverlay: (wholeFlow?: boolean) => void;
  readonly back: () => void;
  readonly forward: () => void;
}

/** History-state envelope. The marker distinguishes our entries from anything
 *  else sharing the same `window.history` (Vite client, OS gestures). */
interface PhoneNavState {
  readonly tnPhoneNav: true;
  readonly workspace: string | null;
  readonly route: PhoneRoute;
  readonly overlay: PhoneHistoryOverlay | null;
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

/** Menus are chrome state, not destinations users should revisit with Forward. */
function isEphemeralMenu(overlay: PhoneOverlay | null): overlay is PhoneMenuOverlay {
  return overlay !== null && overlay.kind !== "inspector";
}

function navState(
  workspace: string | null,
  route: PhoneRoute,
  overlay: PhoneHistoryOverlay | null,
  depth: number
): PhoneNavState {
  return { tnPhoneNav: true, workspace, route, overlay, depth };
}

/**
 * Browser-history-backed navigation for the phone chrome.
 *
 * Routes and the inspector drawer share one stack: inspectors push
 * `history.pushState` entries so Android system Back and the visible Back
 * button dismiss them before content history. Every other overlay — the
 * navigation drawer, tab switcher, action-items menu, New-note popup — is
 * ephemeral React state and never touches history, so Back closes them and
 * Forward can never revisit them.
 * `window.history`
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
  const depth = current.depth;
  const entryRef = useRef(current);
  const [ephemeralMenu, setEphemeralMenuState] = useState<PhoneMenuOverlay | null>(null);
  const ephemeralMenuRef = useRef<PhoneMenuOverlay | null>(null);
  const overlay = ephemeralMenu ?? current.overlay;
  // Branch tip: the deepest depth of the current history branch. A push past a
  // Back'd-from entry truncates it, so the tip always tracks the last write;
  // a workspace-mismatched entry reads as tip 0 like its derived Files route.
  const [tip, setTip] = useState(0);
  const tipRef = useRef(0);
  const skipParentMenuOnPopRef = useRef(false);
  const effectiveTip = entry.workspace === workspaceRoot ? tip : 0;

  // Cold mount and workspace change both start at Files. `replaceState` rather
  // than `pushState`: the root entry is not a visit, so it must not leave a
  // history entry Back could land on.
  useEffect(() => {
    const reset = navState(workspaceRoot, filesRoute, null, 0);
    window.history.replaceState(reset, "");
    entryRef.current = reset;
    tipRef.current = 0;
    skipParentMenuOnPopRef.current = false;
    ephemeralMenuRef.current = null;
    /* eslint-disable react-hooks/set-state-in-effect -- A workspace switch is a
       genuine reset, not state derived from props: the derived-Files read above
       only *masks* the old entry, and without writing the reset into `entry`/
       `tip` a switch A→B→A resurrects A's stale route and Forward tip. */
    setEntry(reset);
    setTip(0);
    setEphemeralMenuState(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [workspaceRoot]);

  /** Writes `state` to history (top of the stack, or in place) and adopts it. */
  const commit = useCallback((state: PhoneNavState, inPlace: boolean) => {
    if (inPlace) window.history.replaceState(state, "");
    else window.history.pushState(state, "");
    entryRef.current = state;
    setEntry(state);
  }, []);

  const replaceOverlay = useCallback(
    (nextOverlay: PhoneHistoryOverlay | null) => {
      const base = entryRef.current;
      commit(navState(workspaceRoot, base.route, nextOverlay, base.depth), true);
    },
    [workspaceRoot, commit]
  );

  const setEphemeralMenu = useCallback((nextMenu: PhoneMenuOverlay | null) => {
    ephemeralMenuRef.current = nextMenu;
    setEphemeralMenuState(nextMenu);
  }, []);

  /** Closes the open menu, reporting whether one was open. */
  const closeEphemeralMenu = useCallback(() => {
    if (ephemeralMenuRef.current === null) return false;
    setEphemeralMenu(null);
    return true;
  }, [setEphemeralMenu]);

  // Android hardware-Back bridge. `WryActivity`'s default handler only walks
  // the WebView's *native* session history, which ignores pushState entries —
  // so `MainActivity` asks this function instead: above the root it steps back
  // (popstate then runs the same overlay-then-content restore), at the root it
  // declines and Android's normal Back behaviour (background/exit) applies.
  useEffect(() => {
    const handler = (): boolean => {
      if (dismissTopOverlay()) return true;
      if (closeEphemeralMenu()) return true;
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
  }, [closeEphemeralMenu]);

  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      const previous = entryRef.current;
      // `overlay` is read wider than `PhoneNavState` declares on purpose: an
      // entry written before menus left history can still carry one, and only
      // an inspector is a valid historical surface — anything else drops.
      type PoppedState = Omit<PhoneNavState, "overlay"> & { readonly overlay?: PhoneOverlay | null };
      const s = event.state as Partial<PoppedState> | null;
      const marked: PoppedState | null =
        s?.tnPhoneNav === true && s.workspace === workspaceRoot && s.route !== undefined && typeof s.depth === "number"
          ? (s as PoppedState)
          : null;
      const restored = marked?.overlay;
      const overlay: PhoneHistoryOverlay | null =
        restored?.kind === "inspector" ? restored : null;
      // A valid pop keeps the known branch tip (Forward can walk back up);
      // a foreign state resets both route and tip to the Files root.
      const next = marked
        ? navState(workspaceRoot, marked.route, overlay, marked.depth)
        : navState(workspaceRoot, filesRoute, null, 0);
      if (!marked) {
        tipRef.current = 0;
        setTip(0);
      }
      // Back from a child inspector restores its ephemeral parent menu without
      // putting that menu in history. Whole-flow dismissal suppresses it.
      const restoreActionsMenu =
        !skipParentMenuOnPopRef.current && previous.overlay?.parent === "actions";
      skipParentMenuOnPopRef.current = false;
      setEphemeralMenu(restoreActionsMenu ? { kind: "actions" } : null);
      entryRef.current = next;
      setEntry(next);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [workspaceRoot, setEphemeralMenu]);

  const pushEntry = useCallback(
    (nextRoute: PhoneRoute, nextOverlay: PhoneHistoryOverlay | null) => {
      setEphemeralMenu(null);
      const nextDepth = entryRef.current.depth + 1;
      commit(navState(workspaceRoot, nextRoute, nextOverlay, nextDepth), false);
      // pushState truncates any forward entries: the new entry is the tip.
      tipRef.current = nextDepth;
      setTip(nextDepth);
    },
    [workspaceRoot, commit, setEphemeralMenu]
  );

  const push = useCallback(
    (next: PhoneRoute) => {
      if (sameRoute(entryRef.current.route, next) && entryRef.current.overlay === null) {
        // Same destination: the only visible change is closing an open menu.
        setEphemeralMenu(null);
        return;
      }
      pushEntry(next, null);
    },
    [pushEntry, setEphemeralMenu]
  );

  const replace = useCallback(
    (next: PhoneRoute) => {
      setEphemeralMenu(null);
      commit(navState(workspaceRoot, next, null, entryRef.current.depth), true);
    },
    [workspaceRoot, commit, setEphemeralMenu]
  );

  const openEphemeralMenu = useCallback(
    (next: PhoneMenuOverlay) => {
      // If a destination-like overlay was open, consume its slot just as a peer
      // replacement would; the menu itself remains only in React state.
      if (entryRef.current.overlay !== null) replaceOverlay(null);
      setEphemeralMenu(next);
    },
    [replaceOverlay, setEphemeralMenu]
  );

  /**
   * The shared prelude for showing an overlay: a no-op when the same surface
   * is already up, and menus are handled entirely in React state. Returns
   * the inspector to show, or null when the request was fully handled.
   */
  const present = useCallback(
    (next: PhoneOverlay): PhoneHistoryOverlay | null => {
      if (sameOverlay(ephemeralMenuRef.current ?? entryRef.current.overlay, next)) return null;
      if (!isEphemeralMenu(next)) return next;
      openEphemeralMenu(next);
      return null;
    },
    [openEphemeralMenu]
  );

  const openOverlay = useCallback(
    (next: PhoneOverlay) => {
      const inspector = present(next);
      if (inspector) pushEntry(entryRef.current.route, inspector);
    },
    [present, pushEntry]
  );

  // Peer surfaces never stack. Menus stay in local chrome state; inspectors
  // push over content, or replace an open inspector's entry in place.
  const showOverlay = useCallback(
    (next: PhoneOverlay) => {
      const inspector = present(next);
      if (!inspector) return;
      if (entryRef.current.overlay === null) {
        pushEntry(entryRef.current.route, inspector);
        return;
      }
      replaceOverlay(inspector);
    },
    [present, pushEntry, replaceOverlay]
  );

  const dismissOverlay = useCallback(
    (wholeFlow = false) => {
      if (closeEphemeralMenu()) return;
      const current = entryRef.current;
      if (wholeFlow && current.overlay?.parent === "actions") {
        skipParentMenuOnPopRef.current = true;
      }
      if (current.overlay !== null && current.depth > 0) window.history.back();
    },
    [closeEphemeralMenu]
  );

  const back = useCallback(() => {
    if (closeEphemeralMenu()) return;
    if (entryRef.current.depth > 0) window.history.back();
  }, [closeEphemeralMenu]);

  const forward = useCallback(() => {
    if (entryRef.current.depth < tipRef.current) {
      setEphemeralMenu(null);
      window.history.forward();
    }
  }, [setEphemeralMenu]);

  // Memoized so consumers can depend on `navigation` in effects without
  // re-running on every unrelated render.
  return useMemo(
    () => ({
      route,
      overlay,
      depth,
      canGoBack: depth > 0 || ephemeralMenu !== null,
      canGoForward: depth < effectiveTip,
      push,
      replace,
      openOverlay,
      showOverlay,
      dismissOverlay,
      back,
      forward,
    }),
    [
      route,
      overlay,
      depth,
      ephemeralMenu,
      effectiveTip,
      push,
      replace,
      openOverlay,
      showOverlay,
      dismissOverlay,
      back,
      forward
    ]
  );
}
