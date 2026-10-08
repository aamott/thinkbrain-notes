# Whether a bootstrap becomes the app-wide singleton is guessed from which options were passed

- **Urgency:** low
- **Difficulty:** easy
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/extensions/bootstrap.ts`
- **Lines:** 356–360

## Description

`bootstrapExtensions` publishes to `bootstrapRef` only when none of
`commands`, `panels`, `host`, or `mobileNewNoteActions` were injected — a proxy
for "is this the real app bootstrap". The heuristic has holes in both
directions:

- `bootstrapExtensions({ extensions: [...] })` or `bootstrapExtensions({
  compatibilityHost: custom })` — plausible configurations — publish to the
  global ref even though the caller may have wanted an isolated bootstrap.
- Conversely, a caller that *wants* a published bootstrap with one injected
  registry has no way to get one.

Today no production caller hits this (`main.tsx` calls it with no options), so
it's a latent footgun rather than a live bug.

## Recommendation

Make publication explicit: add `publish?: boolean` (defaulting to the current
heuristic or to `true` when no options at all are given), or invert it —
never auto-publish and let `main.tsx` call `setExtensionBootstrap(bootstrap)`
itself, which also removes the `getExtensionBootstrapInternal` aliased import
needed for the dispose guard.

## Verification

Read bootstrap.ts:356–360 — the guard inspects a subset of `BootstrapOptions`
fields, not an explicit flag. `main.tsx:16` is the only production caller and
passes nothing. Tests always inject at least `host`/`commands`/`panels`
(bootstrap.test.ts:29–35), so the guard works today only by convention.
