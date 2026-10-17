import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import {
  currentVisit,
  findVisit,
  tabTrailId,
  type DesktopTabAction,
  type DesktopTabState
} from "../../tabs/tabModel";
import type { LeftPanel } from "../shellTypes";
import { samePhoneRoute, type PhoneNavigation, type PhoneRoute } from "./usePhoneNavigation";

/** The inputs {@link usePhoneRouteSync} reads. */
export interface UsePhoneRouteSyncParams {
  readonly route: PhoneRoute;
  readonly navigation: PhoneNavigation;
  readonly tabState: DesktopTabState;
  readonly stateRestored: boolean;
  readonly dispatchTabs: Dispatch<DesktopTabAction>;
  /**
   * Restores a recorded visit by id — moves the cursor without recording.
   * How an absent destination rejoins the strip is the caller's choice (the
   * phone passes `replace-active`, its always-one-surface slot).
   */
  readonly goToVisit: (visitId: number) => void;
  readonly setLeftPanel: Dispatch<SetStateAction<LeftPanel | null>>;
  /**
   * The logical trail the current browser segment belongs to — written by
   * the sync (and read by the caller's `isVisitLive`, so entries of another
   * trail are never content targets). `null` before the first tab route:
   * the segment is still the seed's Files root.
   */
  readonly browserTrailRef: MutableRefObject<string | null>;
}

/**
 * Whether two routes ask for different reconciliation.
 *
 * Narrower than {@link samePhoneRoute}: two bound tab routes are the same
 * destination only when they name the same *visit* — a same-document jump —
 * and an unbound or re-pointed route for one tab counts as unchanged intent,
 * so binding and rename-follow never look like a fresh route-driven restore.
 */
function sameSyncRoute(a: PhoneRoute, b: PhoneRoute): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "tab" && b.kind === "tab") {
    if (a.visitId !== undefined && b.visitId !== undefined) {
      return a.visitId === b.visitId;
    }
    return a.tabId === b.tabId;
  }
  return samePhoneRoute(a, b);
}

/**
 * Keeps the browser-history route and the shared location history in
 * agreement, with one authority per transition.
 *
 * Route-driven (a pop or push just changed the route): a bound tab route
 * restores its *visit* through `goToVisit` — never recording a fresh visit,
 * and able to reopen a displaced resource the tab strip no longer shows. A dead route — visit scrubbed by an explicit close, or a tab
 * gone with no visit bound — is rewritten in place so Back cannot strand the
 * user on a ghost entry.
 *
 * Core-driven (the shared history moved under a stable route): a new visit —
 * a same-document jump, an extension open, a conflict review — is mirrored
 * as a phone browser entry. A jump arriving while an inspector sits on the
 * tab consumes the inspector's history slot instead of burying it: Back must
 * return to the bare pre-jump visit, not reopen the sheet that triggered it.
 * Explicit openers that pushed a bare tab route are *bound* to their new
 * visit in place: one open is one entry, and an open inspector survives.
 *
 * The split exists because restore and mirroring must never fight: a core
 * visit arriving under a stable bound route is mirrored, never restored back
 * to the route's older visit — and a route's own restore in flight is never
 * mirrored as a new entry.
 */
export function usePhoneRouteSync({
  route,
  navigation,
  tabState,
  stateRestored,
  dispatchTabs,
  goToVisit,
  setLeftPanel,
  browserTrailRef
}: UsePhoneRouteSyncParams): void {
  // Files/panel routes own the left surface; a tab route hides it. Small and
  // keyed on the route alone — reconciliation below never writes panel state.
  useEffect(() => {
    setLeftPanel(route.kind === "panel" ? route.panel : route.kind === "files" ? "explorer" : null);
  }, [route, setLeftPanel]);

  // The one reconciliation pass. Runs every commit; `prev` holds the route,
  // visit, active tab and trail as of the last one, which is what lets a
  // route-driven restore be told apart from a core-driven new visit.
  const prevRef = useRef<{
    readonly route: PhoneRoute;
    readonly visitId: number | null;
    readonly activeTabId: string | null;
    readonly trailId: string | null;
  } | null>(null);
  useEffect(() => {
    const prev = prevRef.current;
    const visit = currentVisit(tabState.history);
    const activeTab = tabState.tabs.find((tab) => tab.id === tabState.activeTabId) ?? null;
    const trailId = activeTab === null ? null : tabTrailId(activeTab);
    prevRef.current = {
      route,
      visitId: visit?.id ?? null,
      activeTabId: tabState.activeTabId,
      trailId
    };
    // Seeding observes without navigating — a restored session or a cold
    // mount belongs at Files, not mid-stack.
    if (!stateRestored || prev === null) return;

    // The browser segment belongs to one logical trail at a time — tracked
    // on `browserTrailRef`, independent of the previous core trail, so the
    // reducer's close-fallback counts too. Whenever a *tab* route is showing
    // and the selected trail is not the segment's owner, the segment is
    // rebuilt: Files Home plus the selected trail's retained visits, cursor
    // on its selected one. A trail change under Files (a background close's
    // fallback, a switch made from the drawer) leaves the visible surface
    // alone and waits until a tab route is actually showing.
    if (route.kind === "tab" && trailId !== null && browserTrailRef.current !== trailId) {
      if (browserTrailRef.current === null) {
        // The seed segment gains its owner without a rebuild — the visits
        // below mirror or bind the entry that is already on screen.
        browserTrailRef.current = trailId;
      } else {
        const trailVisits = tabState.history.entries.filter(
          (entry) => tabTrailId(entry.tab) === trailId
        );
        const cursor = trailVisits.findIndex((entry) => entry.id === visit?.id);
        if (trailVisits.length > 0 && cursor >= 0) {
          browserTrailRef.current = trailId;
          navigation.rebaseTabHistory(
            trailVisits.map((entry) => ({
              kind: "tab" as const,
              tabId: entry.tab.id,
              visitId: entry.id
            })),
            cursor
          );
          return;
        }
      }
    }

    const openIds = new Set(tabState.tabs.map((tab) => tab.id));

    const routeChanged = !sameSyncRoute(prev.route, route);
    const visitChanged = prev.visitId !== (visit?.id ?? null);
    const tabChanged = prev.activeTabId !== tabState.activeTabId;
    const activeRoute = tabState.activeTabId !== null
      ? ({ kind: "tab", tabId: tabState.activeTabId } as const)
      : ({ kind: "files" } as const);
    // Pushes the new active tab as a fresh entry — but only for a genuine
    // activation/open: when the previous tab is gone, the new active id is
    // the reducer's close-fallback, and pushing it would shove a tab route
    // over whatever surface (e.g. Files) the user closed the tab from.
    const shouldPushActive =
      tabChanged &&
      visitChanged &&
      tabState.activeTabId !== null &&
      (prev.activeTabId === null || openIds.has(prev.activeTabId));

    if (routeChanged) {
      if (route.kind === "tab") {
        const visitId = route.visitId;
        if (visitId !== undefined) {
          if (findVisit(tabState.history, visitId) !== null) {
            // A revisit, not a new visit: restore moves the cursor without
            // recording, and reopens a displaced descriptor when needed.
            if (visit?.id !== visitId) goToVisit(visitId);
          } else {
            navigation.replace({ kind: "files" });
          }
        } else if (visit !== null && visit.tab.id === route.tabId) {
          // Pushed before the visit id was known (dispatch + push in one
          // batch): bind in place — no second entry, no lost inspector.
          navigation.bindVisit(visit.id, route.tabId);
        } else if (openIds.has(route.tabId)) {
          // `activate` records a visit, so dispatch only on a real change.
          if (tabState.activeTabId !== route.tabId) {
            dispatchTabs({ type: "activate", tabId: route.tabId });
          }
        } else {
          navigation.replace(activeRoute);
        }
      }
      return;
    }

    if (route.kind === "tab") {
      if (route.visitId !== undefined) {
        if (visit === null && findVisit(tabState.history, route.visitId) === null) {
          // The last tab closed and its visit is gone: no survivor visit to
          // rewrite to. Falling back to Files in place keeps a dead tab
          // surface (the fake Welcome) off screen and leaves Forward with
          // nothing bound to reopen.
          navigation.replace({ kind: "files" });
        } else if (visit !== null && visit.id === route.visitId && visit.tab.id !== route.tabId) {
          // Rename/retarget followed: the visit kept its id and moved
          // descriptor — re-point the route in place.
          navigation.bindVisit(route.visitId, visit.tab.id);
        } else if (visit !== null && visit.id !== route.visitId) {
          const next: PhoneRoute = { kind: "tab", tabId: visit.tab.id, visitId: visit.id };
          if (findVisit(tabState.history, route.visitId) === null) {
            // The routed visit died with an explicit close — rewrite the
            // entry to the survivor visit in place, never reopening it.
            navigation.replace(next);
          } else if (navigation.overlay?.kind === "inspector" && visit.tab.id === route.tabId) {
            navigation.replace(next);
          } else {
            navigation.push(next);
          }
        }
      } else if (visit !== null && visit.tab.id === route.tabId) {
        navigation.bindVisit(visit.id, route.tabId);
      } else if (!openIds.has(route.tabId)) {
        navigation.replace(activeRoute);
      } else if (shouldPushActive) {
        navigation.push({ kind: "tab", tabId: tabState.activeTabId! });
      }
      return;
    }

    if (shouldPushActive) {
      navigation.push({ kind: "tab", tabId: tabState.activeTabId! });
    }
  });
}
