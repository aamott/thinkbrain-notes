import type { DesktopTabState } from "./tabModel";

export interface TabReorderAction {
  readonly type: "reorder";
  readonly tabId: string;
  readonly toIndex: number;
}

/** Reordering is purely visual: preserve tab objects and the entire navigation ledger. */
export function reorderTab(state: DesktopTabState, { tabId, toIndex }: TabReorderAction): DesktopTabState {
  const from = state.tabs.findIndex((tab) => tab.id === tabId);
  if (from < 0 || !Number.isFinite(toIndex)) return state;
  const to = Math.max(0, Math.min(state.tabs.length - 1, Math.trunc(toIndex)));
  if (from === to) return state;
  const tabs = [...state.tabs];
  const [tab] = tabs.splice(from, 1);
  tabs.splice(to, 0, tab!);
  return { ...state, tabs };
}
