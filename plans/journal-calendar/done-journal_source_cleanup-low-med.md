# Story: Journal source cleanup (from 2026-10-10 audit)

`docs/reviews/2026-10-10/journal-source-audit-med-med.md` — take the top
items; skip the marginal ones.

## Acceptance

- [ ] `JournalPanel` delete dialog replaced by shell `ModalDialog` (fixes
      missing portal/focus-trap/Escape/inert — an a11y regression, ~-20 lines).
- [ ] Shared `useJournalListing` hook for the duplicated
      list+error-map+reloadToken machinery in `useJournalEntriesQuery` and
      `CalendarTabContainer`.
- [ ] `JournalTroubleCode` aliases `JournalErrorCode`; trouble copy shares
      the service constants; the ~8 copy tests collapse into one
      parametrized test.
- [ ] Optional: `JournalPanel` extraction toward ~330 lines (entry actions,
      windowing) — only if it stays behavior-identical.
