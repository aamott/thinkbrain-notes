# Story: Journal Service & Daily-Note Creation

**Status:** pending · **Urgency:** high · **Difficulty:** med

## Epic

Part of [Journal & Calendar](../pending-journal-calendar-high-hard.md).

## Goal

Implement a typed, UI-independent service that resolves a journal date, expands the approved folder/filename convention, loads/applies an approved template, and creates or opens a daily Markdown note through existing workspace adapters.

## Questions first

- What is “today” when the device timezone, workspace preference, and note timezone differ?
- If the target path exists, should the service open it, report a conflict, or offer a new name?
- Which template source and precedence are approved, and how are missing variables handled?
- Should backfilled notes use the same template and metadata defaults as today’s note?
- What is the error/retry behavior when the workspace is unavailable or a path is invalid?

**STOP gate:** Do not implement path expansion, template interpolation, or create/open actions until the owner approves date semantics, collision behavior, template rules, and error copy. A placeholder template is not a product decision.

## Likely files

- `apps/desktop/src/journal/journalService.ts` (new service facade over typed adapters).
- `apps/desktop/src/journal/journalPath.ts` and `journalTemplate.ts` (new pure helpers; split if either grows).
- `apps/desktop/src/journal/journalService.test.ts`, `journalPath.test.ts`, `journalTemplate.test.ts` (new).
- `apps/desktop/src/workspace/workspaceDocumentAdapter.ts` and `workspaceAdapter.ts` (consume existing APIs; only extend typed interfaces if a gap is proven).
- `apps/desktop/src/native/commands.ts` (only if a required typed native command is missing; no direct Tauri calls from core/UI).
- `packages/core/src/journal/types.ts` (from data-model story).

## Dependencies

- Approved discovery/wireframes and data/frontmatter contract.
- Existing `WorkspaceDocumentApi`, `WorkspaceDesktopApi`, `loadWorkspaceDocument`, `saveWorkspaceDocument`, and native error shape.
- Existing frontmatter mutation policy (`created_at` at creation, `updated_at` on explicit save).

## Acceptance criteria

- [ ] Service accepts injected clock/timezone/path/template dependencies for deterministic tests.
- [ ] Folder and filename expansion uses only approved, path-safe tokens; traversal, empty names, and invalid extensions fail loudly with typed diagnostics.
- [ ] Daily-note creation is idempotent according to the approved collision policy and never overwrites an existing file accidentally.
- [ ] New contents are valid Markdown with approved frontmatter/template metadata; unknown fields are not dropped when updating an existing note.
- [ ] Listing/opening returns typed missing, malformed, unavailable-workspace, and native-I/O errors without swallowing details.
- [ ] Service is platform/UI agnostic at its boundary and does not own panel state.
- [ ] Tests cover local-midnight/timezone edges, leap days, week/month/year folder tokens, path traversal, template variables, existing files, and native failures.

## Tests / manual checks

- Run focused service tests plus `pnpm lint`, `pnpm typecheck`, and `pnpm test`/`./scripts/qa.sh`.
- Manual in a temporary workspace: create today, create a past date, reopen an existing date, try an invalid template/path, and inspect the resulting files outside the app.
- Verify opening/listing alone produces no file timestamp or content rewrite.

## Automated validation

Run focused service/path/template tests, `pnpm lint`, `pnpm typecheck`, and `pnpm test` or `./scripts/qa.sh`.

## Manual desktop/mobile checks

Desktop: use a temporary workspace for today/past/existing/invalid/error flows and inspect files externally. Mobile/shared webview: verify date/path behavior, keyboard/suspension cancellation, and explicit unavailable workspace handling without desktop paths.

## Non-goals

- No calendar aggregation or panel UI, no mood/activity picker, no settings UI, no extension registration, no reminders, and no background watcher.
- Do not add a journal database or change generic workspace CRUD semantics.
