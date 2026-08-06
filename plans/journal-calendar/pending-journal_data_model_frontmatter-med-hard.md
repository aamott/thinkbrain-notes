# Story: Journal Data Model & Markdown Frontmatter Contract

**Status:** pending · **Urgency:** med · **Difficulty:** hard

## Epic

Part of [Journal & Calendar](../pending-journal-calendar-high-hard.md).

## Questions first

- Which frontmatter keys are required, optional, user-extensible, or reserved?
- Are date, timezone, mood, and activity values scalar, list, or structured values?
- Must a journal note remain valid when opened outside ThinkBrain Notes?
- What should happen when fields have the wrong type, duplicate values, an unknown mood/activity, or a date that disagrees with the filename?
- Which existing `created_at`/`updated_at` semantics apply to journal creation and explicit save?

**STOP gate:** Do not add types, serializers, validators, migrations, or fixtures until the product owner approves the written field table, examples, invalid-data policy, and compatibility promise. Do not infer final keys from UI labels.

## Goal

Define platform-agnostic journal metadata and a stable Markdown contract that composes with the existing note parser while preserving unknown frontmatter and plain-file portability.

## Likely files

- `packages/core/src/journal/types.ts` (new: journal date/ref, metadata, template and path expansion types).
- `packages/core/src/journal/frontmatter.ts` (new: journal-specific normalization/validation helpers; reuse generic parser rather than duplicate YAML parsing).
- `packages/core/src/journal/index.ts` and `packages/core/src/index.ts` (new exports).
- `packages/core/src/journal/types.test.ts` and `packages/core/src/journal/frontmatter.test.ts` (new fixtures/tests).
- `packages/core/src/frontmatter.ts`, `packages/core/src/markdown.ts`, `packages/core/src/note-model.ts` (likely integration touch points only; preserve generic behavior).
- `plans/journal-calendar/assets/journal-frontmatter-examples.md` (new approved examples, including unknown fields and malformed cases).

## Dependencies

- Discovery/wireframes story approved.
- Existing generic boundaries: `packages/core/src/frontmatter.ts`, `markdown.ts`, `note-model.ts`.
- `plans/technical-decisions.md` frontmatter mutation policy and comment-preserving follow-up remain binding.

## Acceptance criteria

- [ ] A documented field table distinguishes filename-derived date from frontmatter date and defines timezone/locale handling without hiding ambiguity.
- [ ] Types represent mood/activity metadata without hard-coding an unapproved vocabulary; user-defined/unknown values have an explicit policy.
- [ ] Normalization validates types, trims/canonicalizes only approved values, reports diagnostics, and preserves unknown frontmatter fields.
- [ ] Serialization is ordinary Markdown/YAML and never stores journal data in a database or workspace cache.
- [ ] Parsing/opening/indexing does not rewrite files; explicit creation/save follows existing timestamp policy.
- [ ] Examples cover minimal note, full metadata, absent metadata, malformed YAML, unknown fields, duplicate values, and filename/date mismatch.
- [ ] Unit tests cover round trips, diagnostics, no-rewrite behavior, and backward-compatible generic notes.

## Tests / manual checks

- `packages/core` unit tests for every approved example and timezone boundary.
- Run `pnpm --filter @thinkbrain/core test` (or repository equivalent), `pnpm lint`, and `pnpm typecheck`.
- Manual: open examples in a plain text editor and verify they remain understandable/portable; edit an unknown field and confirm it survives an explicit journal update.

## Automated validation

Run focused core fixtures/round-trip tests, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.

## Manual desktop/mobile checks

Desktop: open approved examples outside the app and verify explicit save preserves unknown fields without rewrite. Mobile/shared webview: run the same pure parser fixtures and verify no desktop/native dependency is required.

## Non-goals

- No service, calendar aggregation, UI, settings registration, extension host work, or migration of existing notes.
- Do not require frontmatter comments to be preserved beyond the existing dedicated round-trip story unless that story is explicitly included as a dependency.
