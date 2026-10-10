# Review: 2026-10-10 — audits + architecture pass

Scope: two source audits (journal, settings) from `other_tasks` stories, plus
three architecture reviews — renderer shell/state, core/extensions/editor,
and the Rust host — run after the 0.4 issue batch. Judgment-level reviews, not
line-level bug hunts; every report ends with a "keep as-is" list.

## Files

- `journal-source-audit-med-med.md` — top item: `JournalPanel`'s hand-rolled
  delete dialog should be `ModalDialog` (a11y regression); duplicated
  listing machinery wants a shared hook.
- `settings-source-audit-med-med.md` — duplicated test scaffolding, a
  pass-through module, `settingsStore.ts` split.
- `architecture-shell-state-med-hard.md` — top item: one workspace-session
  owner above both chromes; the explorer should consume the session, not
  load it. Then: split the `ShellState` mega-bag, deduplicate chrome
  composition, inject the command surface, finish the `native/` boundary.
- `architecture-core-extensions-editor-med-hard.md` — top item: do not wire
  a remote marketplace onto the same-realm loader without a real trust
  decision; introduce resource/view providers before more file types;
  simplify activation to complete declarative contributions; unify
  Markdown/frontmatter semantics in core; separate privileged built-ins
  from the public API.
- `architecture-native-backend-med-hard.md` — top item: four independent
  per-workspace maps (watcher, engine, search pool, window roots) want one
  canonical-root-keyed session owner; attach/bootstrap races can leak an
  engine under a dead label or resurrect deleted metadata; sync commands
  block the IPC path; the TS command map is hand-mirrored.

## Convergent findings

Three reviewers independently circled the same two seams:

- **Workspace session ownership.** The renderer review (shell #1) and the
  native review (backend #1) both want one owner per workspace — on the JS
  side for loading/switching state, on the Rust side for engine/watcher/
  search-pool lifetime keyed by canonical root. The `detach_engine_on_delete`
  story is the first concrete leak from this gap; a `WorkspaceSession`
  abstraction is the structural fix. Worth one epic, not two.
- **The `native/` boundary is documented but incomplete.** Both sides flag
  `@tauri-apps/*` imports escaping into feature folders (events, `isTauri`,
  platform checks) and the hand-mirrored `NativeCommandMap`. A lint rule +
  typed event/capability adapters closes most of it; ts-rs/tauri-specta is
  the heavier answer for contract drift.

## Disagreements / judgment calls

- The extensions review recommends *removing* the parsed-but-inert
  `onCommand:`/`onView:` activation events in favor of complete declarative
  contributions; the 2026-10-07 review closed the same observation as a
  documented decision. The new recommendation is a design evolution, not a
  contradiction — keep in mind if contribution surfaces grow.
- `packages/core` is praised as genuinely platform-pure by both renderer-side
  reviews; the honest-contract finding is about *ports* living in the app,
  not about core breaking its own rule.
