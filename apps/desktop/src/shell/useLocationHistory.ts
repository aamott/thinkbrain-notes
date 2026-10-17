/**
 * The impure half of location-centric history — the shell-side boundary that
 * gives the pure tab reducer live editor positions.
 *
 * Three concerns live here, and nowhere else:
 *
 * - **Departure capture.** `dispatchWithDepartureCapture` (dispatched through
 *   the `useHistoryDispatch` callback) snapshots the live editor's selection
 *   and viewport into the visit being left whenever an action moves the user
 *   somewhere — a DOM read the pure reducer could never do itself — so Back
 *   later restores where the user actually was.
 * - **Pending restores.** A visit the cursor lands on queues its recorded
 *   position; the restore applies only once the destination tab's editor is
 *   live *and* its document has synced the latest text — guarded by visit id
 *   so a rapid second navigation or an unmount drops the stale request.
 * - **Position mapping.** Every doc-changing transaction in a live editor is
 *   reported by the view registry and folded into the stored locations via
 *   `mapLocations`, keeping captured anchors on the same text. A mapping is
 *   counted before it is dispatched (a local epoch), so a restore queued in
 *   the same commit waits for the mapped position rather than applying the
 *   pre-mapping one.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject
} from "react";

import { useNotificationStore } from "../notifications/notificationStore";
import {
  captureEditorLocation,
  editorHeadingLine,
  editorLinePosition,
  isEditorAtLine,
  restoreEditorLocation,
  subscribeEditorMapping,
  subscribeEditorViews
} from "../tabs/editorLocationRegistry";
import {
  currentVisit,
  isDocumentBackedKind,
  tabTrailId,
  type DesktopTabAction,
  type DesktopTabState,
  type EditorLocation
} from "../tabs/tabModel";
import type { DocumentViewState } from "./shellTypes";

/**
 * Action types that move the user somewhere — the only ones a departure
 * capture precedes. Typing, scrolling, dirty flags and close bookkeeping
 * never record positions; explicit closes scrub their visits anyway.
 */
const DEPARTURE_ACTIONS: ReadonlySet<DesktopTabAction["type"]> = new Set([
  "open",
  "activate",
  "goBack",
  "goForward",
  "restoreVisit",
  "navigateToLocation"
]);

/**
 * Dispatches `action`, snapshotting the departing position first when the
 * action moves the user somewhere — into the visit that is current in
 * `state` *now* (named by id, since batched actions can move the cursor
 * before the reducer processes the capture).
 */
function dispatchWithDepartureCapture(
  dispatch: Dispatch<DesktopTabAction>,
  action: DesktopTabAction,
  state: DesktopTabState
): void {
  if (DEPARTURE_ACTIONS.has(action.type)) {
    const visit = currentVisit(state.history);
    const location =
      visit === null || state.activeTabId === null
        ? undefined
        : captureEditorLocation(state.activeTabId);
    if (visit !== null && location !== undefined) {
      // The guard names the tab actually captured — a visit whose tab has
      // drifted from the active one must not take this position.
      dispatch({
        type: "setVisitLocation",
        visitId: visit.id,
        location,
        tabId: state.activeTabId ?? undefined
      });
    }
  }
  dispatch(action);
}

/**
 * Traversal actions that must save a dirty document before moving it: the
 * user stays put — nothing appended, nothing discarded — when the guard
 * declines. Explicit opens and tab switches carry their own policy.
 */
const GUARDED_ACTIONS: ReadonlySet<DesktopTabAction["type"]> = new Set([
  "goBack",
  "goForward",
  "restoreVisit"
]);

/**
 * What a pending navigation is leaving: the active view, its logical trail
 * and the visit the cursor is on. Bookkeeping dispatches — dirty flags,
 * location captures, edit mappings — hand back a new state object but keep
 * this identity; only a real move changes it.
 */
export interface NavigationSource {
  readonly viewId: string;
  readonly trailId: string;
  readonly visitId: number | null;
}

/** The navigation source of `state`, or `null` while nothing is on screen. */
export function navigationSource(state: DesktopTabState): NavigationSource | null {
  const tab = state.tabs.find((candidate) => candidate.id === state.activeTabId);
  if (!tab) return null;
  return {
    viewId: tab.id,
    trailId: tabTrailId(tab),
    visitId: currentVisit(state.history)?.id ?? null
  };
}

/** Whether two sources name the same departure. */
export function sameNavigationSource(
  a: NavigationSource | null,
  b: NavigationSource | null
): boolean {
  return (
    a === b ||
    (a !== null &&
      b !== null &&
      a.viewId === b.viewId &&
      a.trailId === b.trailId &&
      a.visitId === b.visitId)
  );
}

/**
 * The departure-enriched dispatch every tab action should flow through.
 *
 * A hook rather than a factory because the state read must happen when the
 * callback *fires*, not while a `useMemo` factory is being evaluated during
 * render — which is exactly where it would trip the react-hooks refs rule.
 *
 * When `beforeNavigateRef` holds the shell's save guard, a traversal started
 * on a dirty document awaits it first. `navigationSeqRef` counts navigation
 * *requests*: a departure action bumps it the moment it is asked for, so a
 * newer open, activation or traversal cancels an older pending hop — while
 * the guard's own save bookkeeping (a `setDirty` committing mid-await)
 * leaves the request untouched. The source identity is the backstop for
 * changes no request sequence can see (a close swapping the active view).
 */
export function useHistoryDispatch(
  dispatch: Dispatch<DesktopTabAction>,
  stateRef: RefObject<DesktopTabState>,
  beforeNavigateRef?: RefObject<(() => Promise<boolean>) | null>,
  navigationSeqRef?: RefObject<number>
): Dispatch<DesktopTabAction> {
  return useCallback(
    (action: DesktopTabAction) => {
      const departing = DEPARTURE_ACTIONS.has(action.type);
      if (departing && navigationSeqRef) navigationSeqRef.current += 1;
      const state = stateRef.current;
      const guard = beforeNavigateRef?.current;
      const dirty =
        GUARDED_ACTIONS.has(action.type) &&
        state.tabs.some((tab) => tab.id === state.activeTabId && tab.isDirty);
      if (dirty && guard) {
        const source = navigationSource(state);
        const pending = guard();
        // The shared guard registers its own request before yielding.
        const seq = navigationSeqRef?.current;
        void pending.then((ok) => {
          if (!ok) return;
          const latest = stateRef.current;
          if (seq !== undefined && navigationSeqRef?.current !== seq) return;
          if (!sameNavigationSource(source, navigationSource(latest))) return;
          dispatchWithDepartureCapture(dispatch, action, latest);
        });
        return;
      }
      dispatchWithDepartureCapture(dispatch, action, state);
    },
    [dispatch, stateRef, beforeNavigateRef, navigationSeqRef]
  );
}

/** What {@link useLocationHistory} publishes on the shell state. */
export interface LocationHistoryApi {
  /** In-file jump to a 1-based line — the outline's heading click. */
  readonly navigateToLine: (line: number) => void;
  /**
   * Same-note heading jump from a `#fragment` link — resolves against the
   * live editor document and warns instead of moving when nothing matches.
   */
  readonly navigateToHeading: (fragment: string) => void;
  /**
   * Restores a visit by id within the active trail — the phone's go-to-visit
   * API. The destination takes over the active strip slot; other trails'
   * visits are refused (switching tabs is a separate explicit activation).
   */
  readonly goToVisit: (visitId: number) => void;
  /**
   * Snapshots the live editor's position into the current visit and returns
   * it — for callers about to hide the tab surface (the phone leaving a tab
   * for Home or a panel). `null` when there is nothing to capture.
   */
  readonly captureCurrentLocation: () => EditorLocation | null;
}

/**
 * A queued position restore is the visit id alone. The tab id and location
 * are re-read off the visit when it applies: a rename can move the
 * descriptor while the restore waits for its editor, and stored positions
 * remap through edits — a copy taken at arm time could already be stale.
 */

export function useLocationHistory({
  tabState,
  dispatchTabs,
  dispatchNavigation,
  documents,
  loadDocumentIntoView
}: {
  readonly tabState: DesktopTabState;
  /** Raw dispatch, for bookkeeping actions that need no departure capture. */
  readonly dispatchTabs: Dispatch<DesktopTabAction>;
  /** The departure-enriched dispatch, for actions that are themselves visits. */
  readonly dispatchNavigation: Dispatch<DesktopTabAction>;
  readonly documents: Readonly<Record<string, DocumentViewState>>;
  readonly loadDocumentIntoView: (
    tabId: string,
    rootPath: string,
    relativePath: string,
    kind?: string
  ) => void;
}): LocationHistoryApi {
  // Latest state for the event-time callbacks below, which must not rebuild
  // on every tab change.
  const stateRef = useRef(tabState);
  useEffect(() => {
    stateRef.current = tabState;
  });

  // A purely local scheduling fence: the ref is bumped synchronously when an
  // editor transaction reports — BEFORE its mapLocations dispatch lands —
  // while the state mirror makes the applied count visible to the render.
  // Comparing the two tells the restore effect a mapping is still in flight.
  const mappingEpochRef = useRef(0);
  const [mappingEpoch, setMappingEpoch] = useState(0);

  // Fold each live transaction's changes into the stored locations — the
  // editor reports them through the view registry (see useCodeMirrorView).
  useEffect(
    () =>
      subscribeEditorMapping((tabId, changes) => {
        mappingEpochRef.current += 1;
        dispatchTabs({ type: "mapLocations", tabId, changes });
        setMappingEpoch(mappingEpochRef.current);
      }),
    [dispatchTabs]
  );

  // Pending position restore for the visit the cursor just landed on —
  // keyed by visit id, so a location *update* to the current visit (a
  // departure capture or an edit remap) never re-arms it.
  const pendingRef = useRef<number | null>(null);
  const lastVisitIdRef = useRef<number | null>(null);
  const armRestore = useCallback((state: DesktopTabState): void => {
    const visit = currentVisit(state.history);
    pendingRef.current = visit?.location ? visit.id : null;
    lastVisitIdRef.current = visit?.id ?? null;
  }, []);
  useEffect(() => {
    const visitId = currentVisit(tabState.history)?.id ?? null;
    if (visitId === lastVisitIdRef.current) return;
    armRestore(tabState);
  }, [tabState, armRestore]);

  // Editors mount and unmount as tabs change; a pending restore retries
  // whenever the live set does. The same tick re-arms the current visit's
  // stored position: a kept-mounted editor re-shown under an unmoved cursor
  // (the phone returning from Home, announced via notifyEditorVisibility)
  // gets its departure position back. Typing and doc mappings never touch
  // the view set, so they cannot re-arm.
  const [viewEpoch, setViewEpoch] = useState(0);
  useEffect(
    () =>
      subscribeEditorViews(() => {
        armRestore(stateRef.current);
        setViewEpoch((epoch) => epoch + 1);
      }),
    [armRestore]
  );

  // Applies the queued position once the visit's tab is active with a live
  // editor *and* its latest text is on screen. Running at shell level puts
  // it after the editor's own value-sync effect in the same commit; the
  // document gate below additionally waits out an async load, so a restore
  // can never land on stale or loading content. A stale request dies the
  // moment the cursor moves on to another visit.
  useEffect(() => {
    const pendingVisitId = pendingRef.current;
    if (pendingVisitId === null) return;
    const visit = currentVisit(tabState.history);
    if (!visit || visit.id !== pendingVisitId || !visit.location) {
      pendingRef.current = null;
      return;
    }
    // Resolve the destination at apply time: a rename may have moved the
    // visit's descriptor to a new tab id while the restore waited.
    const tabId = visit.tab.id;
    if (tabState.activeTabId !== tabId) return;
    // An editor transaction that reported during this commit queues a
    // mapLocations that lands next render — the stored position here is
    // pre-mapping, so wait for the render carrying it (and the epoch).
    if (mappingEpoch !== mappingEpochRef.current) return;
    // A document-backed tab that is still loading has no reliable position
    // space yet — wait for the ready state this map publishes.
    const doc = documents[tabId];
    if (doc !== undefined && doc.phase !== "ready") return;
    // Focus is part of the restore: Back/Forward must land the caret visible
    // with the editor focused. A covered surface refuses both — the request
    // stays queued until the editor is visible.
    if (restoreEditorLocation(tabId, visit.location, { focus: true })) {
      pendingRef.current = null;
    }
  }, [tabState, documents, viewEpoch, mappingEpoch]);

  // A restored visit can reopen a displaced tab nothing backs with text:
  // load it through the ordinary loader, but only when view state is truly
  // missing — a dirty open document is never re-read underneath the user.
  const activeTab =
    tabState.tabs.find((tab) => tab.id === tabState.activeTabId) ?? null;
  useEffect(() => {
    const resource = activeTab?.resource;
    if (!activeTab || !resource?.rootPath || !resource.relativePath) return;
    if (!isDocumentBackedKind(activeTab.kind)) return;
    if (documents[activeTab.id] !== undefined) return;
    loadDocumentIntoView(
      activeTab.id,
      resource.rootPath,
      resource.relativePath,
      activeTab.kind
    );
  }, [activeTab, documents, loadDocumentIntoView]);

  const navigateToLine = useCallback(
    (line: number) => {
      const state = stateRef.current;
      const tabId = state.activeTabId;
      if (tabId === null) return;
      // Already landed on this target — caret there, viewport still holding
      // it at the top. Dispatching anyway would record a duplicate in-file
      // visit (the stored capture carries a scroll snapshot where the jump
      // carries a scroll position, so the locations never compare equal).
      if (isEditorAtLine(tabId, line)) return;
      const pos = editorLinePosition(tabId, line);
      if (pos === undefined) return;
      const location: EditorLocation = { anchor: pos, head: pos, scrollPos: pos };
      dispatchNavigation({ type: "navigateToLocation", location });
      // Same-tab, live view: apply right away — this also covers a deduped
      // jump that recorded nothing. If a visit did land, the pending-restore
      // effect applies the same position again harmlessly.
      restoreEditorLocation(tabId, location, { focus: true });
    },
    [dispatchNavigation]
  );

  // A heading link jumps inside the note already on screen: the live editor
  // document resolves the fragment (unsaved headings count), then the
  // ordinary line jump carries dedupe, departure capture, focus and restore.
  // A miss surfaces a warning notification — no history, no selection move.
  const navigateToHeading = useCallback(
    (fragment: string) => {
      const state = stateRef.current;
      const tab = state.tabs.find((candidate) => candidate.id === state.activeTabId);
      if (!tab || tab.kind !== "editor") return;
      const line = editorHeadingLine(tab.id, fragment);
      if (line === undefined) return;
      if (line === null) {
        useNotificationStore.getState().addNotification({
          source: "navigation",
          dedupKey: `heading:${tab.id}:${fragment}`,
          title: "Heading not found",
          message: `No heading matches "${fragment}" in this note.`,
          severity: "transient",
          variant: "warning"
        });
        return;
      }
      navigateToLine(line);
    },
    [navigateToLine]
  );

  const goToVisit = useCallback(
    (visitId: number) => {
      dispatchNavigation({ type: "restoreVisit", visitId });
    },
    [dispatchNavigation]
  );

  const captureCurrentLocation = useCallback((): EditorLocation | null => {
    const state = stateRef.current;
    const visit = currentVisit(state.history);
    const location =
      state.activeTabId === null ? undefined : captureEditorLocation(state.activeTabId);
    if (visit === null || location === undefined) return null;
    dispatchTabs({
      type: "setVisitLocation",
      visitId: visit.id,
      location,
      tabId: state.activeTabId ?? undefined
    });
    return location;
  }, [dispatchTabs]);

  return { navigateToLine, navigateToHeading, goToVisit, captureCurrentLocation };
}
