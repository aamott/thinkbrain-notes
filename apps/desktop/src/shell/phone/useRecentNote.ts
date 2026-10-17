import { useCallback, useMemo } from "react";

import { isNoteTab, type DesktopTab, type DesktopTabState } from "../../tabs/tabModel";
import type { PhoneRoute } from "./usePhoneNavigation";

/** The shell values {@link useRecentNote} reads. */
export interface UseRecentNoteParams {
  readonly tabState: DesktopTabState;
  readonly activeTab: DesktopTab | null;
  readonly route: PhoneRoute;
  /** The phone's ordinary note opener — the same path a Files tap takes. */
  readonly openNote: (relativePath: string) => void;
}

/** The most recent other note, plus the callback that opens it. */
export interface RecentNoteResult {
  readonly recentNote: {
    readonly id: string;
    readonly title: string;
    /** Vault-relative path the ordinary opener resolves. */
    readonly relativePath: string;
  } | null;
  readonly openRecentNote: () => void;
}

/**
 * The New-note popup's "Open most recent note" affordance.
 *
 * Reads a two-entry MRU of distinct Markdown notes out of the shared
 * location history: `entries` is already the visit order and each visit
 * carries its tab descriptor, so a displaced-but-retained note still
 * resolves. While a note is on screen this answers the *previous* note —
 * A→B offers A, and reopening on A offers B — while Files or a panel still
 * gets the note currently open underneath.
 *
 * Picking the row is *fresh* navigation, not history traversal: it goes
 * through the same opener a Files tap uses, so the normal save/placement/
 * capture rules apply, a brand-new visit is recorded, and the forward tail
 * is truncated — never a time-travel to the old visit's selection.
 */
export function useRecentNote({
  tabState,
  activeTab,
  route,
  openNote
}: UseRecentNoteParams): RecentNoteResult {
  const recentNote = useMemo(() => {
    // Distinct note visits, most recent first. Scan the whole visit log —
    // not just up to the cursor — because restoreVisit moves the cursor
    // without recording, so the other note's visit legitimately sits in the
    // "forward" tail after an A↔B toggle. The visit's retained descriptor
    // is the id authority: a closed tab's visits are already scrubbed, so
    // what remains is safe to offer.
    const noteVisits: { readonly tab: DesktopTab; readonly relativePath: string }[] = [];
    for (
      let index = tabState.history.entries.length - 1;
      index >= 0 && noteVisits.length < 2;
      index -= 1
    ) {
      const visit = tabState.history.entries[index];
      const relativePath = visit?.tab.resource?.relativePath;
      if (
        visit &&
        relativePath !== undefined &&
        isNoteTab(visit.tab) &&
        !noteVisits.some((v) => v.tab.id === visit.tab.id)
      ) {
        noteVisits.push({ tab: visit.tab, relativePath });
      }
    }
    const viewingNoteId =
      route.kind === "tab" && isNoteTab(activeTab) && route.tabId === activeTab.id
        ? activeTab.id
        : null;
    const candidate =
      viewingNoteId !== null
        ? noteVisits.find((visit) => visit.tab.id !== viewingNoteId)
        : (noteVisits.find((visit) => visit.tab.id === activeTab?.id) ?? noteVisits[0]);
    return candidate
      ? { id: candidate.tab.id, title: candidate.tab.title, relativePath: candidate.relativePath }
      : null;
  }, [activeTab, route, tabState]);

  const openRecentNote = useCallback(() => {
    if (recentNote) openNote(recentNote.relativePath);
  }, [openNote, recentNote]);

  return { recentNote, openRecentNote };
}
