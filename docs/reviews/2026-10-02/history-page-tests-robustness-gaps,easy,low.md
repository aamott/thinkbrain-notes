# history_page_tests: self-oracle assertion, coverage gaps, and slow fixture

- **Difficulty:** easy
- **Urgency:** low
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/sync/history_page_tests.rs`
- **Lines:** 92-100, 130-145, 555-608

## Description

Three test-robustness items in the same file:

1. **Self-oracle (130-145):** `new_commits_do_not_shift_an_existing_page` derives `expected` by calling `read_all`, which runs through the same `page()` → `events()` → `history_walk` pipeline being asserted on — a systematic ordering defect would corrupt both sides identically and still pass. Not vacuous (cursor root-pinning is still exercised), but weaker than it looks.
2. **Coverage gaps (555-608):** the forged-cursor tests never reach the "at least one root required" rejection in `decode_cursor` (history_page.rs:105-107) — the only `roots: {}` payload is rejected on the version check first. Cursor scope is tested note→other-note but not ledger↔note direction (`note: None` cursor vs `Some` scope).
3. **Slow fixture (92-100):** `the_history_passes_five_thousand_commits` builds 5,100 real commits and re-gathers the full stream per page — potentially tens of seconds on filesystem-limited CI, with no slow-test annotation.

## Recommendation

Assert `second.changes` against literal commit ids captured before the extra commits. Add `expect_invalid` cases with `"roots": {}` at `v: 1` and a ledger-minted cursor replayed against a per-note scope. Consider bounding or annotating the 5,100-commit test.

## Verification

Read `page`/`events`/`decode_cursor` in history_page.rs (87-107, 135-145, 203-218) and the cited test lines; the version check precedes the roots check. (The `read_all` empty-page hang guard from the original report was addressed.)
