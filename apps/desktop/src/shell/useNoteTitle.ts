import { normalizeRoot } from "@thinkbrain/core";

import { useSettingsStore } from "../settings/settingsStore";
import type { DesktopTab } from "../tabs/tabModel";
import { isNoteTitleEligible } from "./noteTitleEligibility";

/** Settings key for the journal root. */
const JOURNAL_ROOT_KEY = "extension-journal-calendar.root";

/**
 * Whether the editable {@link NoteTitleRow} appears above `tab`'s content.
 *
 * Both chromes ask the same question — desktop above the editor, phone above
 * the note — so the journal-root lookup and the eligibility rule are wired
 * here once. Journal entries render their own dateline, so the title row
 * hides there; only ordinary Markdown editor tabs get a title.
 */
export function useNoteTitle(tab: DesktopTab | null): boolean {
  const journalRoot = useSettingsStore(
    (s) => normalizeRoot(String(s.getEffectiveValue(JOURNAL_ROOT_KEY) ?? "journal"))
  );
  return isNoteTitleEligible(tab?.kind, tab?.resource?.relativePath, journalRoot);
}
