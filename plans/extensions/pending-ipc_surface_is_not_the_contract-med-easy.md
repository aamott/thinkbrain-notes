# Story: Tauri Command Names Are Not the Extension Contract

**Status:** ⬜ pending · **Urgency:** med · **Difficulty:** easy

> Prompted 2026-08-28 by
> `docs/reviews/2026-08-28/rust-backend/redundant-markdown-rename-delete-ipc,med,low.md`,
> which found two unused commands and correctly refused to delete them as
> ordinary dead code, because Tauri command names are externally callable and
> `wip-workspace-explorer-med-med.md` had said to keep them. That is a question
> about what we promise, not about whether the code runs — so it needed
> answering before anything was removed.

## The question

Is direct Tauri IPC a supported contract for extensions?

## The answer: no, and it could not be enforced today anyway

Extensions are ESM modules bundled to a blob URL and `import()`ed into the
app's own realm (`desktopLocalDirectoryLoader.ts:45`). **There is no sandbox.**
An extension can already reach `window.__TAURI_INTERNALS__.invoke` and call any
command, registered in our map or not, along with any module the app imports.

So retaining a command "in case an extension calls it" protects nothing. The
extension that wants it can equally call the generic command, or read the
filesystem, or reach into any module. Retention does not create compatibility;
it creates a second path to maintain.

**The supported contract is the host API** — `workspaceBridge`, the
contribution registries, the settings bridge. The things we document, version
and test. Command names sit below that line.

## Two tiers, and one rule

- **Contract commands.** Deliberately exposed, documented, kept stable, changed
  with care. Today this list is **empty**, because there is no consumer that
  needs it.
- **Internal commands.** Everything else. Deletable like any dead code.

**Promote deliberately, never accumulate accidentally.** A command joins the
first tier because someone decided it should, in writing, with a reason — not
because it happened to exist when an extension reached for it.

## Why sync becoming an extension does not change this

`pending-auto_sync-med-hard.md:81` already settles it: "Direct app feature
first, extension later. […] **Migration is a refactor — native layer
unchanged.**" And `extensions/pending-beta_builtin_extensions-med-med.md:52`
makes the Git sync built-in a **registration-only** module that delegates
behaviour to its epic, with step 5 asserting no feature implementation is
imported. Built-ins are "trusted app code; there is no third-party install path
or separate privilege model."

So the sync conversion creates no arms-length IPC consumer. The auto-sync
epic's non-goals exclude third-party sync provider extensions outright.

## When to reopen this

- **A third-party extension needs native work the host API does not cover.**
  Then design a contract surface deliberately and promote into it.
- **Extensions move out of the realm** — a worker, a subprocess. Then the
  boundary becomes genuinely enforceable and worth designing. Reopen it as
  "design the IPC contract", never as "un-delete what we removed."

## The two commands this unblocks

`rename_markdown_file` and `delete_markdown_file` (`markdown.rs:243-312`)
duplicate `rename_workspace_entry` and `delete_workspace_entry`
(`workspace_entries.rs:128-259`) and have no caller anywhere in the repo.

They are also **worse than what they duplicate**, though not in the way the
review's wording first suggested to me. Both pairs do watcher suppression
(`record_self_write`) and search-index removal. What the Markdown-specific
pair lacks is `acquire_workspace_mutation_lock()`, which the generic
implementation takes for the whole operation — so a Markdown rename can race
any other workspace mutation. It also lacks the generic version's no-op
handling, where renaming an entry to its own path returns it unchanged instead
of failing with `file_exists`.

So calling them would buy a lock-free rename and a spurious error on a no-op.
That is not compatibility worth preserving, it is a trap with a familiar
name.

`wip-workspace-explorer-med-med.md:25-28` said to keep them "for the
editor/index flows that depend on them". Those flows migrated to the generic
commands; the instruction outlived its reason. That plan line is corrected as
part of this story rather than left contradicting the code.

## Acceptance

- [ ] The tier rule above is stated where an implementer will find it, not only
      in this story
- [ ] `rename_markdown_file` and `delete_markdown_file` removed: Rust
      implementations, `NativeCommandMap` entries, `app_command_handlers!`
      registration, and `APP_COMMAND_PATHS` with its count and assertions
- [ ] `wip-workspace-explorer-med-med.md`'s retention note corrected, so the
      next reader is not told to preserve something that no longer exists
- [ ] Markdown path validation and error contracts still covered for the
      commands that remain — the generic ones must not have inherited a gap
- [ ] `pnpm qa` green
