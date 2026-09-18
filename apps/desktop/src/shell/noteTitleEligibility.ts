/**
 * Decides whether the editable {@link NoteTitleRow} appears above a tab's
 * content. Only ordinary Markdown editor tabs qualify: journal entries render
 * their own dateline, and non-Markdown tabs (`.py`, viewers, settings) have no
 * note title to edit.
 */
export function isNoteTitleEligible(
  kind: string | undefined,
  relativePath: string | null | undefined,
  journalRoot: string
): boolean {
  return kind === "editor"
    && relativePath?.toLowerCase().endsWith(".md") === true
    && !relativePath.startsWith(`${journalRoot}/`);
}
