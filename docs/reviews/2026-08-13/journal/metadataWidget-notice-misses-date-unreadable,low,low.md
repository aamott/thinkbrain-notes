- name: MetadataWidget notice filter misses journal_date_unreadable
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/journal/MetadataWidget.tsx
- lines: 189-238
- description: |
    The `notice` picker (line 189) selects a diagnostic when
    `diagnostic.code === "journal_date_mismatch" || diagnostic.code.startsWith("frontmatter")`.
    `resolveEntryDate` (packages/core/src/journal/frontmatter.ts lines 96-106)
    emits a third code, `journal_date_unreadable`, when the frontmatter `date`
    key is present but not a parseable ISO date. That code is neither
    `journal_date_mismatch` nor prefixed `frontmatter`, so it is dropped: the
    notice block never renders for it, and the user sees no explanation for a
    note whose frontmatter date is garbage.
    The notice copy branches on `notice.code === "journal_date_mismatch"` and
    otherwise says "frontmatter couldn't be read" — which would actually be
    the right message for `journal_date_unreadable`, except the filter excludes
    it.
- verification: |
    grep confirms `journal_date_unreadable` is produced in
    packages/core/src/journal/frontmatter.ts line 102. The MetadataWidget
    filter only matches `journal_date_mismatch` and the `frontmatter` prefix.
- fix: |
    Add `journal_date_unreadable` to the filter predicate (or match any code
    starting with `journal_date_`), so the existing "frontmatter couldn't be
    read" branch covers it.
