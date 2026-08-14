- name: formatLongDate and formatSheetDate are near-duplicates
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/journal/MetadataWidget.tsx
- lines: 59-79
- description: |
    `formatLongDate` (line 65) and `formatSheetDate` (line 76) are identical
    except for whether the year is appended:
      `formatLongDate` → `${weekday}, ${MONTHS[m-1]} ${day}, ${year}`
      `formatSheetDate` → `${weekday}, ${MONTHS[m-1]} ${day}`
    Both compute the weekday the same way (the duplication flagged
    separately) and both look up the month name the same way. Two functions,
    two call sites (one each), doing the same work with a cosmetic
    difference is exactly the "real duplication" case the compact-code skill
    calls out.
- verification: |
    Read of lines 65-79: the bodies differ only by the trailing `, ${year}`.
    Each function is called exactly once (lines 210 and 268).
- fix: |
    Replace both with one `formatJournalLongDate(date, { withYear })` (or
    pass a format string). ~4 lines saved and one place to fix the weekday
    computation when the shared helper lands.
