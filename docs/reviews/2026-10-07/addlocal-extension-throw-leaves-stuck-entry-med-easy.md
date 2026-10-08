# `addLocalExtension` leaves a stuck, unreachable entry when registration throws mid-way

- **Urgency:** med
- **Difficulty:** easy
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/extensions/bootstrap.ts`
- **Lines:** 191–224 (`registerAndStub`), 315–338 (`addLocalExtension`)

## Description

`registerAndStub` is only transactional up to `host.register`: the try/catch at
200–218 rolls back new-note action rows if action registration or
`host.register` throws, but `registerStubs` is called *outside* that block
(line 222). If a stub registration throws — e.g. a manifest declaring two
commands with the same id, which `createContributionRegistry` rejects
(`contributions.ts:77–81`; tracked separately as
`manifest-duplicate-contribution-ids`) — the failure propagates with
`state.stubs` partially populated, `state.registration` held, and the entry
already in `states` (set at line 333 before `registerAndStub` ran).

Because `rebuildSnapshot()` never ran, `entries()` doesn't list the half-added
extension, so the Extensions panel cannot offer a Remove button. But
`states.has(id)` is still true, so retrying `local.add(directory)` after the
user fixes the directory fails with "already registered", and
`removeLocalExtension(id)` works only for callers that already know the id —
the UI never shows it. The extension is stuck until restart.

The same gap exists in the built-in loop: `registerAndStub` throwing during the
initial `for (const extension of extensions)` pass (line 275) aborts
`bootstrapExtensions` with earlier built-ins already stubbed into the global
registries and no bootstrap object to dispose them through.

## Recommendation

Wrap `registerStubs` in the same transactional guard: on throw, dispose
`state.stubs` and `state.mobileNewNoteActionRegistrations`, dispose
`state.registration`, and remove the entry from `states` in `addLocalExtension`
(`states.delete(state.manifest.id)`) before rethrowing. For the built-in loop,
letting `bootstrapExtensions` throw is fine, but ideally stubs registered by
earlier iterations are torn down before rethrowing.

## Verification

Read bootstrap.ts:151–188 (`registerStubs` pushes into `state.stubs` as it
registers — the throwing call itself isn't tracked), 200–223 (try/catch ends
before `registerStubs`), 315–338 (`states.set` before `registerAndStub`;
`rebuildSnapshot` only on the success path). Confirmed `register` throws on
duplicate ids at contributions.ts:77–81 and that `manifest.ts`
`readContributions` (167–214) has no duplicate check. `localExtensions.ts:93–101`
converts the throw into a failed `LoadOutcome`, so the user sees "load failed"
while the extension remains half-registered.
