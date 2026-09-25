# Journal & Calendar Epic — Completed Work

The decision register (D1–D88) lives at
`plans/journal-calendar/assets/journal_discovery_and_wireframes.md`; stories
cite it rather than restating decisions.

## Discovery & Wireframes — `journal_discovery_and_wireframes`

D1–D88 product decisions, approved moodboard (D35), IA/mobile wireframes
(D37/D39/D40). File moved to `assets/` — it is a reference artifact, not a
story.

## Data Model & Frontmatter — `journal_data_model_frontmatter`

`packages/core/src/journal/`: filename parser (`YYYY-MM-DD-HHmm` with `-2`/`-3`
counters, D42 format table, UNDATED for unparseable names), entry comparator,
date resolution, field-definition validation, lenient metadata reading with an
unknown-field pass-through bag. The write round-trip shipped via
`apps/desktop/src/journal/frontmatterEdit.ts` — surgical per-key edits that
leave comments, order, and unknown fields byte for byte.

## Journal Service — `journal_service_daily_notes`

`apps/desktop/src/journal/journalService.ts` + `packages/core/src/journal/paths.ts`:
always-create entries (D18), same-minute counter suffixes (D30), configurable
`journal/YYYY/MM` root (D7), backfill stamped with the current clock time on
the supplied date (D61/D62), listing via `listNotes` directory scan with the
undated split (D36/D38), openToday, D63 approved failure copy, lazy first-line
previews.

## Field Editor & Open Vocabulary — `field_editor_and_open_vocabulary`

Approved mockup (D82). Field-definition editor, self-healing values, and `＋
Add` (D83/D84 open vocabulary) shipped; extends `journal_settings_and_accessibility`.
