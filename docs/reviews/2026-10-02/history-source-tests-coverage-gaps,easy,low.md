# history_source_tests: retained-ref validation and metadata version mismatch untested

- **Difficulty:** easy
- **Urgency:** low
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/sync/history_source_tests.rs`
- **Lines:** 89-99, 177-227

## Description

`a_bind_with_invalid_names_writes_nothing` exercises tag remotes, short locals, foreign sources, and tag activation, but never a `refs/thinkbrain/sources/retained/...` ref — `validate_source` (history_source.rs:74-75) explicitly rejects `/retained/` names, and that branch is what stops an archived source from being activated/bound. Likewise `a_corrupt_metadata_file_fails_loudly` covers malformed JSON but not a well-formed file with `version != 1` (history_source.rs:106-111). Given the test file's emphasis on provenance pinning, the retained-ref negative case is the more meaningful gap.

## Recommendation

Add `bind`/`activate` calls with `format!("{}retained/x/{tip}", SOURCE_REF_PREFIX)` expecting `sync.branch_source_failed`, and write a `{"version": 2, ...}` metadata file expecting `sync.branch_source_failed`.

## Verification

Read `validate_source` and `load` in history_source.rs:73-83, 105-111; grep confirmed no test references `retained/` in this file (only history_ingest_safety_tests uses retained refs, for a different code path).
