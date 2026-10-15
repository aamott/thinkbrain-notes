---
name: codebase-pruning
description: Deep audit + removal of dead code, unreachable states, write-only fields, impossible guards, obsolete migrations, and overbuilt feature scaffolding. Use when asked to cut unused/redundant code, slim the codebase, or remove checks for circumstances that cannot happen.
user-invocable: false
---

# Codebase Pruning

Work in two phases: **audit** (find and verify, no edits) then **removal**
(edits plus tests). Partition the tree into disjoint ownership chunks and
dispatch routine subagents in waves of three; the coordinator reviews each
wave's output before the next goes out. The hunt list: dead exports, write-only
fields, dead props and options, guards for states that can't occur, inert
registry or capability entries, test-only seams, stale comments, and obsolete
migrations.

Never remove on suspicion alone — every candidate needs a repo-wide zero-hit
search covering tests, e2e, examples, native code, and dynamic references
(settings keys, command names, event channels — search the literal string, not
just the identifier). A guard that looks impossible in production may still be
reachable in tests (SSR renders have no DOM; test doubles may violate interface
contracts), and reachability anywhere means live code. When a removal breaks a
test, decide which side is wrong: fix an incomplete double rather than
restoring a guard, but restore the guard when the path is genuinely reachable.

Not everything that looks dead is free to cut. Zombie-looking settings keys can
anchor live UI; unpublished-looking events can be extension contracts;
unwired scaffolding can be deliberate. Migration and compat shims need explicit
user authorization — they're a product decision about installed users, not a
code decision. Keep parse-tolerance for stale on-disk keys even when the
migration path goes, and note when removing a fallback changes an error's
shape. Skip removals whose cost dwarfs the gain (one dead interface field
forcing dozens of test rewrites). Run focused tests after each wave — wave
failures can be a sibling wave's edits, so re-run before calling it a
regression — then `pnpm qa` and a full diff review at the end. Report net
lines, regressions caught, claims disproven, and a kept-and-why list so
leftover decisions stay visible.
