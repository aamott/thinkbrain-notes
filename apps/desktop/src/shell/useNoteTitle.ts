import { normalizeRoot } from "@thinkbrain/core";

import { journalManifest } from "../extensions/builtins/journal";
import { extensionSettingsModuleId } from "../extensions/desktopExtensionHost";
import { journalSettingsSchema } from "../journal/journalSettings";
import { useSettingsStore } from "../settings/settingsStore";
import type { DesktopTab } from "../tabs/tabModel";
import { isNoteTitleEligible } from "./noteTitleEligibility";

/**
 * The journal extension's `root` setting, keyed the way the host names
 * extension settings — `extension-${extensionId}.${key}` — rather than as a
 * re-typed literal, so the key follows the manifest id and the host's module
 * naming convention instead of drifting from them.
 */
const JOURNAL_ROOT_KEY = `${extensionSettingsModuleId(journalManifest.id)}.root`;

/**
 * The `root` default the journal itself declared in its settings schema — the
 * same value the extension falls back to when nothing is stored. Reading it
 * here instead of re-declaring `"journal"` a third time keeps the tab-title
 * rule level with the folder the journal writes to: a renamed key or a changed
 * default throws at module load rather than silently disagreeing.
 */
const JOURNAL_ROOT_DEFAULT = (() => {
  const definition = journalSettingsSchema.sections
    .flatMap((section) => section.settings ?? [])
    .find((setting) => setting.key === "root");
  if (typeof definition?.default !== "string") {
    throw new Error("The journal settings schema declares no string `root` default.");
  }
  return definition.default;
})();

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
    (s) => normalizeRoot(String(s.getEffectiveValue(JOURNAL_ROOT_KEY) ?? JOURNAL_ROOT_DEFAULT))
  );
  return isNoteTitleEligible(tab?.kind, tab?.resource?.relativePath, journalRoot);
}
