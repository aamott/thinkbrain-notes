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
 *
 * A tab route may carry the shared location-history `visitId` it was pushed
 * for (see the location-history contract: every visit has a unique numeric
 * id, a tab descriptor and a captured location). The route *refers* to the
 * visit — it never holds an editor anchor of its own — so a restored visit
 * lands exactly where the core recorded it, and a visit whose tab was
 * renamed still resolves through the core entry rather than the stale id.
 */
export type PhoneRoute =
  | { readonly kind: "files" }
  | { readonly kind: "panel"; readonly panel: LeftPanel }
  | { readonly kind: "tab"; readonly tabId: string; readonly visitId?: number };

/**
 * Optional hooks into the shared location-history core.
 *
 * Every callback runs through a ref the navigation updates each commit, so
 * callers may pass a fresh object every render — the history effects and
 * browser listeners always see the latest closures.
 */
export interface PhoneHistoryIntegration {
  /**
   * Snapshots the departing editor's location into the visit being left.
   *
   * Invoked *before* any transition away from a tab route — pushing another
   * route or an inspector, replacing the route, or any backward/forward pop
   * (header, Android, mouse, keyboard or native `popstate`) — while the DOM
   * still shows the departing document. Revisit restore only lands on the
   * right position when the visit leaves holding where the user actually
   * was; typing and scrolling alone never record a visit.
   */
  readonly captureDeparture?: () => void;
  /**
   * Whether `visitId` still names a visit in the shared history. Explicit
   * closes scrub their visits; popped entries pointing at a dead visit are
   * skipped in the direction of travel rather than reopened.
   */
  readonly isVisitLive?: (visitId: number) => boolean;
  /**
   * Save-first gate for pops that leave a document: awaited before the
   * popped route is adopted so the shell can flush a dirty document first.
   * `false` bounces the browser back to the previous physical depth and the
   * target is never adopted. Overlay/menu dismissal never reaches this.
   */
  readonly beforeNavigate?: () => Promise<boolean>;
}

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
type PhoneOverlay =
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
  /** Whether Back can dismiss ephemeral chrome or visit an earlier route. */
  readonly canGoBack: boolean;
  /** Whether the current browser-history branch has a later route or overlay. */
  readonly canGoForward: boolean;
  /** Pushes `route` with no overlay; pushing the current route just closes any open menu. */
  readonly push: (route: PhoneRoute) => void;
  /** Replaces the current entry with `route` and no overlay. */
  readonly replace: (route: PhoneRoute) => void;
  /** Rewrites the current tab route's visit identity in place — keeping any
   *  overlay — for opens that pushed a bare tab route before the core visit
   *  id was known, or renames that moved the visit to a new tab descriptor. */
  readonly bindVisit: (visitId: number, tabId?: string) => void;
  /** Pushes `overlay` as a new history entry — the drill-in used when a surface
   *  sits on top of another (actions menu → inspector) and Back must step out
   *  one level at a time. Menus stay ephemeral either way. */
  readonly pushOverlay: (overlay: PhoneOverlay) => void;
  /** Opens over content, or swaps the currently open overlay in place —
   *  peer surfaces never stack. */
  readonly showOverlay: (overlay: PhoneOverlay) => void;
  /** Pops the overlay; `wholeFlow` skips restoring the menu under an inspector. */
  readonly dismissOverlay: (wholeFlow?: boolean) => void;
  readonly back: () => void;
  readonly forward: () => void;
  /**
   * Rebuilds the browser segment for a logical-trail switch: fresh session,
   * Files at the root, `routes` (the selected trail's retained visits)
   * pushed in order, then one `history.go` hop back to the `cursor`th route
   * when it is not the tip — Forward visits after it survive.
   */
  readonly rebaseTabHistory: (routes: readonly PhoneRoute[], cursor: number) => void;
}

/** History-state envelope. The marker distinguishes our entries from anything
 *  else sharing the same `window.history` (Vite client, OS gestures). */
interface PhoneNavState {
  readonly tnPhoneNav: true;
  readonly workspace: string | null;
  readonly route: PhoneRoute;
  readonly overlay: PhoneHistoryOverlay | null;
  readonly depth: number;
  /** Minted at each workspace reset: workspace alone cannot tell this
   *  session's vault-A entries from a stale A→B→A ancestor's — especially
   *  panel routes, which carry no core visit id. Only pops stamped with the
   *  current session's token are trusted; older same-workspace entries read
   *  as foreign and fall to the Files root. In-memory only — entries written
   *  before tokens existed are foreign, exactly like any other old shape. */
  readonly session: string;
}

const filesRoute: PhoneRoute = { kind: "files" };

/**
 * Physical slots the route ledger retains besides the root: enough for real
 * navigation while staying bounded on long sessions. Depths beyond the
 * newest slots fall out of the map and are skipped — never targets — the
 * same as truncated-forward slots.
 */
const ROUTE_LEDGER_DEPTH_SLOTS = 200;

/** Bounds the ledger to the root entry plus the newest physical slots. */
function boundRouteLedger(routes: ReadonlyMap<number, PhoneRoute>): ReadonlyMap<number, PhoneRoute> {
  if (routes.size <= ROUTE_LEDGER_DEPTH_SLOTS + 1) return routes;
  const newest = [...routes.keys()].sort((a, b) => b - a).slice(0, ROUTE_LEDGER_DEPTH_SLOTS);
  const bounded = new Map<number, PhoneRoute>();
  const root = routes.get(0);
  if (root !== undefined) bounded.set(0, root);
  for (const depth of newest) bounded.set(depth, routes.get(depth)!);
  return bounded;
}

/**
 * Whether two routes name the same destination.
 *
 * A tab route's `visitId` is part of its identity: the same tab at a
 * different visit is a different place (a same-document jump must push a new
 * entry, not collapse onto the previous one). An *unbound* tab route —
 * pushed before its visit id was known — compares equal to the same tab at
 * any visit so re-tapping the open file never stacks a duplicate.
 */
export function samePhoneRoute(a: PhoneRoute | null, b: PhoneRoute | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === "panel" && b.kind === "panel") return a.panel === b.panel;
  if (a.kind === "tab" && b.kind === "tab") {
    return (
      a.tabId === b.tabId &&
      (a.visitId === undefined || b.visitId === undefined || a.visitId === b.visitId)
    );
  }
  return a.kind === "files";
}

const sameRoute = samePhoneRoute;

function sameOverlay(a: PhoneOverlay | null, b: PhoneOverlay | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === "inspector" && b.kind === "inspector") {
    return a.panel === b.panel && a.parent === b.parent;
  }
  // Kinds are already equal: whatever remains is a same-kind menu.
  return true;
}

/** Menus are chrome state, not destinations users should revisit with Forward. */
function isEphemeralMenu(overlay: PhoneOverlay | null): overlay is PhoneMenuOverlay {
  return overlay !== null && overlay.kind !== "inspector";
}

function navState(
  workspace: string | null,
  route: PhoneRoute,
  overlay: PhoneHistoryOverlay | null,
  depth: number,
  session: string
): PhoneNavState {
  return { tnPhoneNav: true, workspace, route, overlay, depth, session };
}

/**
 * The nearest entry in `direction` whose route still names something alive.
 *
 * `window.history` is not enumerable, so liveness is answered from the
 * route-only metadata the hook records per physical depth: Files, panels and
 * unbound tab routes are always live; a bound tab route lives only while its
 * visit does (an explicit close scrubs the visit). Depths missing from the
 * map are skipped — never targets — and `tip` bounds the forward scan.
 */
function nearestLiveDepth(
  routes: ReadonlyMap<number, PhoneRoute>,
  fromDepth: number,
  direction: -1 | 1,
  isVisitLive: (visitId: number) => boolean,
  tip: number
): number | null {
  for (let d = fromDepth + direction; d >= 0 && d <= tip; d += direction) {
    const route = routes.get(d);
    if (route === undefined) continue;
    if (route.kind !== "tab" || route.visitId === undefined || isVisitLive(route.visitId)) {
      return d;
    }
  }
  return null;
}

/**
 * Browser-history-backed navigation for the phone chrome.
 *
 * Routes and the inspector drawer share one stack: inspectors push
 * `history.pushState` entries so Android system Back and the visible Back
 * button dismiss them before content history. Every other overlay — the
 * navigation drawer, tab switcher, action-items menu, New-note popup — is
 * ephemeral React state and never touches history, so Back closes them and
 * Forward can never revisit them. `window.history` is shared, so only states
 * carrying our marker *and* the current workspace are trusted; anything else
 * falls back to Files rather than trusting a foreign shape.
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
export function usePhoneNavigation(
  workspaceRoot: string | null,
  integration?: PhoneHistoryIntegration
): PhoneNavigation {
  // Session token minted once per reset/rebase: it, not the workspace
  // string, is what an A→B→A round-trip invalidates. Only physical history
  // entries are vetted by it — the `""` placeholder never gets pushed.
  const sessionRef = useRef("");
  const [entry, setEntry] = useState<PhoneNavState>(
    () => navState(workspaceRoot, filesRoute, null, 0, "")
  );
  // An entry recorded under another workspace is not this workspace's route:
  // after a switch the chrome reads as Files until something pushes again.
  const current =
    entry.workspace === workspaceRoot ? entry : navState(workspaceRoot, filesRoute, null, 0, "");
  const route = current.route;
  const depth = current.depth;
  const entryRef = useRef(current);
  const [ephemeralMenu, setEphemeralMenuState] = useState<PhoneMenuOverlay | null>(null);
  const ephemeralMenuRef = useRef<PhoneMenuOverlay | null>(null);
  const overlay = ephemeralMenu ?? current.overlay;
  // Branch tip: the deepest depth of the current branch. A push past a
  // Back'd-from entry truncates it; a foreign-workspace entry reads as 0.
  const [tip, setTip] = useState(0);
  const tipRef = useRef(0);
  const skipParentMenuOnPopRef = useRef(false);
  // One-hop bounce guard: a dead-entry pop or a trail-rebase hop issues
  // `history.go`, and the landing pop adopts without a second departure
  // capture, navigation guard, or bounce.
  const bouncePendingRef = useRef(false);
  // One pending guarded hop at a time: later pops bounce back to the depth
  // the guard is deciding on. The record carries its session so a reset or
  // rebase invalidates it without adopting a stale target.
  const guardPendingRef = useRef<{ readonly depth: number; readonly session: string } | null>(null);
  // Route-only metadata keyed by physical depth — the liveness ledger Back
  // and Forward target from; a bound route's `visitId` is its only identity.
  const [routeAtDepth, setRouteAtDepthState] = useState<ReadonlyMap<number, PhoneRoute>>(
    () => new Map([[0, filesRoute]])
  );
  const routeAtDepthRef = useRef(routeAtDepth);
  const setDepthMap = useCallback((next: ReadonlyMap<number, PhoneRoute>) => {
    const bounded = boundRouteLedger(next);
    routeAtDepthRef.current = bounded;
    setRouteAtDepthState(bounded);
  }, []);
  const effectiveTip = entry.workspace === workspaceRoot ? tip : 0;
  // The history integration may hand a fresh object each render; the
  // listeners below read through this ref so they always call the latest
  // closures without re-subscribing.
  const integrationRef = useRef(integration);
  useEffect(() => {
    integrationRef.current = integration;
  });

  /** Snapshots the departing tab's location into its visit, when leaving one. */
  const captureDeparture = useCallback(() => {
    if (entryRef.current.route.kind === "tab") integrationRef.current?.captureDeparture?.();
  }, []);

  /** Stamps a history entry for the current workspace + navigation session. */
  const stamp = useCallback(
    (nextRoute: PhoneRoute, overlay: PhoneHistoryOverlay | null, depth: number): PhoneNavState =>
      navState(workspaceRoot, nextRoute, overlay, depth, sessionRef.current),
    [workspaceRoot]
  );

  // Cold mount and workspace change both start at Files. `replaceState` rather
  // than `pushState`: the root entry is not a visit, so it must not leave a
  // history entry Back could land on. Each reset mints a fresh session token,
  // so a stale same-workspace entry from a previous visit to this vault can
  // never validate against the live session.
  useEffect(() => {
    sessionRef.current = crypto.randomUUID();
    const reset = stamp(filesRoute, null, 0);
    window.history.replaceState(reset, "");
    entryRef.current = reset;
    tipRef.current = 0;
    skipParentMenuOnPopRef.current = false;
    bouncePendingRef.current = false;
    guardPendingRef.current = null;
    ephemeralMenuRef.current = null;
    /* eslint-disable react-hooks/set-state-in-effect -- A workspace switch is a
       genuine reset, not state derived from props: the derived-Files read above
       only *masks* the old entry, and without writing the reset into `entry`/
       `tip` a switch A→B→A resurrects A's stale route and Forward tip. */
    setEntry(reset);
    setTip(0);
    setEphemeralMenuState(null);
    setDepthMap(new Map([[0, filesRoute]]));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [workspaceRoot, stamp, setDepthMap]);

  /** Writes `state` to history (top of the stack, or in place) and adopts it. */
  const commit = useCallback(
    (state: PhoneNavState, inPlace: boolean) => {
      if (inPlace) window.history.replaceState(state, "");
      else window.history.pushState(state, "");
      entryRef.current = state;
      setEntry(state);
      // Record the route at its physical depth; a push truncates anything
      // deeper, exactly as the browser drops the forward branch.
      const nextMap = new Map(routeAtDepthRef.current);
      nextMap.set(state.depth, state.route);
      if (!inPlace) {
        for (const depth of [...nextMap.keys()]) {
          if (depth > state.depth) nextMap.delete(depth);
        }
      }
      setDepthMap(nextMap);
    },
    [setDepthMap]
  );

  const replaceOverlay = useCallback(
    (nextOverlay: PhoneHistoryOverlay | null) => {
      const base = entryRef.current;
      commit(stamp(base.route, nextOverlay, base.depth), true);
    },
    [stamp, commit]
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
        s?.tnPhoneNav === true &&
        s.workspace === workspaceRoot &&
        s.session === sessionRef.current &&
        s.route !== undefined &&
        typeof s.depth === "number"
          ? (s as PoppedState)
          : null;
      const restored = marked?.overlay;
      const overlay: PhoneHistoryOverlay | null =
        restored?.kind === "inspector" ? restored : null;
      // A valid pop keeps the known branch tip (Forward can walk back up);
      // a foreign state resets route, tip and the depth ledger to the Files
      // root — deeper entries are gone for good.
      let next = marked
        ? stamp(marked.route, overlay, marked.depth)
        : stamp(filesRoute, null, 0);
      if (!marked) {
        tipRef.current = 0;
        setTip(0);
        setDepthMap(new Map([[0, filesRoute]]));
      } else if (next.route.kind === "tab" && next.route.visitId === undefined) {
        // Canonical ledger over the physical payload: a tab route pushed
        // bare and then buried by a same-batch inspector never got its
        // pushState rewritten — the binding lives in the ledger, so resolve
        // it here. Independently bound slots are never overridden.
        const ledgerRoute = routeAtDepthRef.current.get(next.depth);
        if (
          ledgerRoute?.kind === "tab" &&
          ledgerRoute.tabId === next.route.tabId &&
          ledgerRoute.visitId !== undefined
        ) {
          next = stamp(ledgerRoute, overlay, next.depth);
        }
      }
      const bouncing = bouncePendingRef.current;
      bouncePendingRef.current = false;
      // Snapshot the departing tab's location into its visit before the
      // route effect turns the DOM around. The landing pop of our own bounce
      // skips it — the departure was already captured.
      if (!bouncing && previous.route.kind === "tab") {
        integrationRef.current?.captureDeparture?.();
      }
      // A popped visit the core scrubbed (its tab was closed) must not
      // reopen. Step to the nearest live entry in the direction of travel —
      // or back to where the gesture came from — instead of a phantom Home.
      const poppedVisitId = next.route.kind === "tab" ? next.route.visitId : undefined;
      const isVisitLive = integrationRef.current?.isVisitLive;
      if (poppedVisitId !== undefined && isVisitLive?.(poppedVisitId) === false) {
        if (bouncing) {
          // The bounce target died mid-hop: never reopen it and never chain
          // a second hop. Reset the branch to the Files root.
          next = stamp(filesRoute, null, 0);
          window.history.replaceState(next, "");
          tipRef.current = 0;
          setTip(0);
          setDepthMap(new Map([[0, filesRoute]]));
        } else {
          const steppingBack = next.depth <= previous.depth;
          const map = routeAtDepthRef.current;
          const backward = nearestLiveDepth(map, next.depth, -1, isVisitLive, tipRef.current);
          const forward = nearestLiveDepth(map, next.depth, 1, isVisitLive, tipRef.current);
          const target = steppingBack ? (backward ?? forward) : (forward ?? backward);
          if (target !== null) {
            bouncePendingRef.current = true;
            window.history.go(target - next.depth);
            return;
          }
          // No live entry anywhere in the branch: fall safe to Home,
          // rewritten in place so a further Back can still reach live
          // entries on the other side.
          next = stamp(filesRoute, null, next.depth);
          window.history.replaceState(next, "");
        }
      }
      // Back from a child inspector restores its ephemeral parent menu without
      // putting that menu in history. Whole-flow dismissal suppresses it.
      const restoreActionsMenu =
        !skipParentMenuOnPopRef.current && previous.overlay?.parent === "actions";
      skipParentMenuOnPopRef.current = false;
      const adopt = () => {
        setEphemeralMenu(restoreActionsMenu ? { kind: "actions" } : null);
        entryRef.current = next;
        setEntry(next);
        if (marked) {
          const nextMap = new Map(routeAtDepthRef.current);
          nextMap.set(next.depth, next.route);
          setDepthMap(nextMap);
        }
      };
      // Leaving a document may have to save it first: adopt the popped
      // route only once the guard answers; `false` bounces back.
      const leavingDocument =
        previous.route.kind === "tab" &&
        !(next.route.kind === "tab" && next.route.tabId === previous.route.tabId);
      const beforeNavigate = integrationRef.current?.beforeNavigate;
      if (guardPendingRef.current !== null) {
        // One guarded hop at a time: duplicate pops return to the depth the
        // pending guard is already deciding on.
        const delta = guardPendingRef.current.depth - next.depth;
        if (delta !== 0) window.history.go(delta);
        return;
      }
      if (!bouncing && leavingDocument && beforeNavigate) {
        const pending = { depth: next.depth, session: sessionRef.current };
        guardPendingRef.current = pending;
        void Promise.resolve()
          .then(beforeNavigate)
          .then((ok) => {
            // A newer pending record, reset or rebase supersedes this hop.
            if (guardPendingRef.current !== pending || pending.session !== sessionRef.current) {
              return;
            }
            guardPendingRef.current = null;
            // A newer transition or a workspace/session change invalidates the hop.
            if (entryRef.current !== previous) return;
            if (!ok) {
              window.history.go(previous.depth - next.depth);
              return;
            }
            // Recapture so the departing visit keeps where the user ended
            // up while the save was in flight.
            integrationRef.current?.captureDeparture?.();
            adopt();
          })
          .catch((error: unknown) => {
            // A rejecting guard must not wedge every later pop: clear the
            // record and bounce back to the depth the user left.
            if (guardPendingRef.current === pending) guardPendingRef.current = null;
            console.error("[usePhoneNavigation] navigation save guard failed", error);
            if (entryRef.current === previous) {
              window.history.go(previous.depth - next.depth);
            }
          });
        return;
      }
      adopt();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [workspaceRoot, stamp, setEphemeralMenu, setDepthMap]);

  const pushEntry = useCallback(
    (nextRoute: PhoneRoute, nextOverlay: PhoneHistoryOverlay | null) => {
      // Leaving a tab route — for Home, a panel or an inspector — snapshots
      // the departing editor's location into its visit before the DOM hides.
      captureDeparture();
      setEphemeralMenu(null);
      const nextDepth = entryRef.current.depth + 1;
      commit(stamp(nextRoute, nextOverlay, nextDepth), false);
      // pushState truncates any forward entries: the new entry is the tip.
      tipRef.current = nextDepth;
      setTip(nextDepth);
    },
    [stamp, commit, setEphemeralMenu, captureDeparture]
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
      if (entryRef.current.route.kind === "tab" && next.kind !== "tab") captureDeparture();
      setEphemeralMenu(null);
      commit(stamp(next, null, entryRef.current.depth), true);
    },
    [stamp, commit, setEphemeralMenu, captureDeparture]
  );

  const bindVisit = useCallback(
    (visitId: number, tabId?: string) => {
      const base = entryRef.current;
      if (base.route.kind !== "tab") return;
      const nextRoute: PhoneRoute = { kind: "tab", tabId: tabId ?? base.route.tabId, visitId };
      if (base.route.visitId === visitId && base.route.tabId === nextRoute.tabId) return;
      // In-place rewrite: the inspector entry (if any) keeps its slot, and no
      // second browser entry appears for an opener that pushed first.
      commit(stamp(nextRoute, base.overlay, base.depth), true);
      // Enrich the ledger's other unbound routes for this tab: a same-batch
      // push below an inspector stays bare physically forever, so the ledger
      // carries the binding the pop handler resolves against. Slots already
      // bound to a visit of their own are never overridden.
      const ledger = new Map(routeAtDepthRef.current);
      for (const [ledgerDepth, ledgerRoute] of ledger) {
        if (
          ledgerRoute.kind === "tab" &&
          ledgerRoute.visitId === undefined &&
          ledgerRoute.tabId === nextRoute.tabId
        ) {
          ledger.set(ledgerDepth, nextRoute);
        }
      }
      setDepthMap(ledger);
    },
    [stamp, commit, setDepthMap]
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

  const pushOverlay = useCallback(
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
    // Same precedence as the Android bridge: registered dismissable overlays
    // (e.g. the settings-nav drawer) first, then ephemeral menus, then content
    // history. Skipping the first step let header Back walk history out from
    // under an open drawer that system Back would have closed.
    if (dismissTopOverlay()) return;
    if (closeEphemeralMenu()) return;
    const depth = entryRef.current.depth;
    if (depth <= 0) return;
    // One `history.go` to the nearest live entry — dead visits (closed tabs)
    // are skipped without ever being adopted. Home at depth 0 always counts
    // as live, so the fallback is the root, not a stranded position.
    const isVisitLive = integrationRef.current?.isVisitLive;
    const target =
      isVisitLive === undefined
        ? depth - 1
        : (nearestLiveDepth(routeAtDepthRef.current, depth, -1, isVisitLive, tipRef.current) ?? 0);
    window.history.go(target - depth);
  }, [closeEphemeralMenu]);

  const forward = useCallback(() => {
    const depth = entryRef.current.depth;
    if (depth >= tipRef.current) return;
    setEphemeralMenu(null);
    const isVisitLive = integrationRef.current?.isVisitLive;
    const target =
      isVisitLive === undefined
        ? depth + 1
        : nearestLiveDepth(routeAtDepthRef.current, depth, 1, isVisitLive, tipRef.current);
    if (target !== null) window.history.go(target - depth);
  }, [setEphemeralMenu]);

  /**
   * A manual logical-tab switch rebuilds the whole browser segment: the
   * current entry is rewritten as Files Home under a fresh session token
   * (old entries become foreign), the selected trail's visits are pushed in
   * order, and — when the trail's selected visit is not the newest — one
   * `history.go` lands the browser on it while Forward keeps the tail.
   */
  const rebaseTabHistory = useCallback(
    (routes: readonly PhoneRoute[], cursor: number) => {
      const session = crypto.randomUUID();
      sessionRef.current = session;
      const stampSession = (route: PhoneRoute, depth: number): PhoneNavState =>
        navState(workspaceRoot, route, null, depth, session);
      window.history.replaceState(stampSession(filesRoute, 0), "");
      const map = new Map<number, PhoneRoute>([[0, filesRoute]]);
      routes.forEach((tabRoute, index) => {
        window.history.pushState(stampSession(tabRoute, index + 1), "");
        map.set(index + 1, tabRoute);
      });
      const tip = routes.length;
      tipRef.current = tip;
      setTip(tip);
      setDepthMap(map);
      setEphemeralMenu(null);
      guardPendingRef.current = null;
      const selectedDepth = Math.max(0, cursor + 1);
      // Adopt the selected route in React *before* the hop: the landing pop
      // then finds React already there instead of restoring the stale tip.
      entryRef.current = stampSession(routes[cursor] ?? filesRoute, selectedDepth);
      setEntry(entryRef.current);
      if (selectedDepth < tip) {
        // The hop's landing pop must not capture a second departure or run
        // the navigation guard — the same flag a dead-visit bounce uses.
        bouncePendingRef.current = true;
        window.history.go(selectedDepth - tip);
      }
    },
    [workspaceRoot, setDepthMap, setEphemeralMenu]
  );

  // Forward only exists while a *live* entry sits deeper on this branch —
  // a tail of scrubbed visits is not a destination. Without visit liveness
  // the depth bound alone answers, as it always did.
  const isVisitLiveNow = integration?.isVisitLive;
  const canGoForward =
    isVisitLiveNow === undefined
      ? depth < effectiveTip
      : nearestLiveDepth(routeAtDepth, depth, 1, isVisitLiveNow, effectiveTip) !== null;

  // Memoized so consumers can depend on `navigation` in effects without
  // re-running on every unrelated render.
  return useMemo(
    () => ({
      route,
      overlay,
      canGoBack: depth > 0 || ephemeralMenu !== null,
      canGoForward,
      push,
      replace,
      bindVisit,
      pushOverlay,
      showOverlay,
      dismissOverlay,
      back,
      forward,
      rebaseTabHistory,
    }),
    [
      route,
      overlay,
      depth,
      ephemeralMenu,
      canGoForward,
      push,
      replace,
      bindVisit,
      pushOverlay,
      showOverlay,
      dismissOverlay,
      back,
      forward,
      rebaseTabHistory
    ]
  );
}
