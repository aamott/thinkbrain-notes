import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";

import type { DesktopTabAction, DesktopTabState } from "../../tabs/tabModel";
import type { LeftPanel } from "../shellTypes";
import type { PhoneNavigation, PhoneRoute } from "./usePhoneNavigation";

/** The inputs {@link usePhoneRouteSync} reads. */
export interface UsePhoneRouteSyncParams {
  readonly route: PhoneRoute;
  readonly navigation: PhoneNavigation;
  readonly tabState: DesktopTabState;
  readonly stateRestored: boolean;
  readonly dispatchTabs: Dispatch<DesktopTabAction>;
  readonly setLeftPanel: Dispatch<SetStateAction<LeftPanel | null>>;
}

/**
 * Keeps the browser-history route and the shared tab/panel state in agreement.
 *
 * Route → tab/panel synchronization. A tab route *activates* its tab through
 * the shared reducer rather than carrying document state of its own; a stale
 * route (tab closed or renamed since the entry was pushed) is rewritten to
 * Files in place, so Back can never strand the user on a ghost entry.
 *
 * The tab sync is keyed on `route` alone: the route is the authority here,
 * and re-running on tab changes would fight the observer below — when a new
 * tab opens under a tab route, activating the old route's tab and pushing
 * the new active tab ping-pong forever. Reconciliation on tab close/rename
 * is the observer's job, and it sees `openTabIds` through a ref. The effect
 * also re-runs when `navigation` changes identity, which is harmless — every
 * branch is idempotent.
 */
export function usePhoneRouteSync({
  route,
  navigation,
  tabState,
  stateRestored,
  dispatchTabs,
  setLeftPanel
}: UsePhoneRouteSyncParams): void {
  // Ref mirrors of the values the two effects below read between renders;
  // declared first so this sync runs before either consumer each commit.
  const routeRef = useRef<PhoneRoute>(route);
  const openTabIdsRef = useRef<ReadonlySet<string>>(new Set());
  const activeTabIdRef = useRef(tabState.activeTabId);
  useEffect(() => {
    routeRef.current = route;
    openTabIdsRef.current = new Set(tabState.tabs.map((tab) => tab.id));
    activeTabIdRef.current = tabState.activeTabId;
  });

  useEffect(() => {
    if (route.kind === "tab") {
      if (openTabIdsRef.current.has(route.tabId)) {
        // `activate` returns a fresh state even for the already-active tab, so
        // dispatch only on a real change — otherwise this effect loops.
        if (activeTabIdRef.current !== route.tabId) {
          dispatchTabs({ type: "activate", tabId: route.tabId });
        }
        setLeftPanel(null);
      } else {
        navigation.replace({ kind: "files" });
      }
    } else {
      setLeftPanel(route.kind === "panel" ? route.panel : "explorer");
    }
  }, [route, dispatchTabs, setLeftPanel, navigation]);

  // Captures opens that bypass the phone wrappers — extension commands, the
  // workspace bridge, a conflict review — so every externally driven active-tab
  // change still lands on the Back stack. Restored tabs are seeded, not pushed:
  // a cold start with a restored session belongs at Files, not mid-stack.
  const observedTabIdRef = useRef<string | null>(null);
  const seededTabRef = useRef(false);
  const activeTabId = tabState.activeTabId;
  useEffect(() => {
    if (!stateRestored) return;
    if (!seededTabRef.current) {
      seededTabRef.current = true;
      observedTabIdRef.current = activeTabId;
      return;
    }
    if (activeTabId === observedTabIdRef.current) return;
    observedTabIdRef.current = activeTabId;
    const current = routeRef.current;
    if (current.kind === "tab" && current.tabId === activeTabId) return;
    if (current.kind === "tab" && !openTabIdsRef.current.has(current.tabId)) {
      navigation.replace(activeTabId ? { kind: "tab", tabId: activeTabId } : { kind: "files" });
    } else if (activeTabId) {
      navigation.push({ kind: "tab", tabId: activeTabId });
    }
  }, [activeTabId, stateRestored, navigation]);
}
