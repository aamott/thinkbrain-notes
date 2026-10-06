import { useCallback, useMemo } from "react";

import { isNoteTab, type DesktopTab, type DesktopTabState } from "../../tabs/tabModel";
import type { PhoneNavigation, PhoneRoute } from "./usePhoneNavigation";

/** The shell values {@link useRecentNote} reads. */
export interface UseRecentNoteParams {
  readonly tabState: DesktopTabState;
  readonly activeTab: DesktopTab | null;
  readonly route: PhoneRoute;
  readonly navigation: PhoneNavigation;
}

/** The most recent other note, plus the callback that opens it. */
export interface RecentNoteResult {
  readonly recentNote: { readonly id: string; readonly title: string } | null;
  readonly openRecentNote: () => void;
}

/**
 * The New-note popup's "Open most recent note" affordance.
 *
 * Reads a two-entry MRU of distinct Markdown tabs out of the reducer's
 * activation history: `entries` is already the visit order, `removeTab`
 * scrubs closed ids and `retarget` follows renames, so a second list here
 * could only drift. While a note is on screen it answers the *previous*
 * note — A→B offers A, and reopening on A offers B — while Files or a panel
 * still gets the note currently open underneath. Stale ids never reopen a
 * closed tab.
 */
export function useRecentNote({
  tabState,
  activeTab,
  route,
  navigation
}: UseRecentNoteParams): RecentNoteResult {
  const recentNote = useMemo(() => {
    const tabs = tabState.tabs;
    const findTab = (id: string | undefined): DesktopTab | undefined =>
      id !== undefined ? tabs.find((tab) => tab.id === id) : undefined;
    // Distinct note ids, most recently activated first.
    const noteIds: string[] = [];
    for (
      let index = tabState.history.cursor;
      index >= 0 && noteIds.length < 2;
      index -= 1
    ) {
      const id = tabState.history.entries[index];
      if (id !== undefined && !noteIds.includes(id) && isNoteTab(findTab(id))) {
        noteIds.push(id);
      }
    }
    const viewingNoteId =
      route.kind === "tab" && isNoteTab(activeTab) && route.tabId === activeTab.id
        ? activeTab.id
        : null;
    const candidate =
      viewingNoteId !== null
        ? findTab(noteIds.find((id) => id !== viewingNoteId))
        : (isNoteTab(activeTab) ? activeTab : findTab(noteIds[0]));
    return candidate ? { id: candidate.id, title: candidate.title } : null;
  }, [activeTab, route, tabState]);

  const openRecentNote = useCallback(() => {
    if (recentNote) navigation.push({ kind: "tab", tabId: recentNote.id });
  }, [navigation, recentNote]);

  return { recentNote, openRecentNote };
}
