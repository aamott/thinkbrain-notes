import { activateExistingTab, removeTab } from "./tabHistory";
import type { DesktopTabState } from "./tabModel";

/** Which neighbours of `tabId` a multi-close targets. */
type TabCloseScope = "others" | "right";

export interface TabCloseMultipleAction {
  readonly type: "closeMultiple";
  readonly tabId: string;
  readonly scope: TabCloseScope;
}

/**
 * "Close other tabs" / "Close tabs to the right" from a tab's context menu.
 *
 * The clicked tab becomes the survivor on screen first — VS Code semantics —
 * so `activeTabId` stays valid no matter which neighbours go. Dirty targets
 * are *skipped*, not confirmed: no multi-tab dirty guard exists, and the menu
 * refuses the action when one sits in the target set. Each removal runs the
 * ordinary single-close helper, so trail scrubbing and preview handling can
 * never drift from the close chip's behaviour.
 */
export function closeMultipleTabs(
  state: DesktopTabState,
  { tabId, scope }: TabCloseMultipleAction
): DesktopTabState {
  const index = state.tabs.findIndex((tab) => tab.id === tabId);
  if (index < 0) return state;
  let next = activateExistingTab(state, tabId);
  const targets = next.tabs.filter((tab, i) => {
    if (tab.id === tabId || tab.isDirty) return false;
    return scope === "others" || i > index;
  });
  for (const tab of targets) next = removeTab(next, tab.id);
  // removeTab clears closeRequest unconditionally; a request parked on a
  // surviving (dirty) tab must keep its dialog rather than be swallowed.
  const request = next.closeRequest ?? state.closeRequest;
  if (request && next.tabs.some((tab) => tab.id === request.tabId)) {
    next = { ...next, closeRequest: request };
  }
  return next;
}
