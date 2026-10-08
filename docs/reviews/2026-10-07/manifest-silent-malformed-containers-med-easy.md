# Manifest parser silently drops malformed `engines` and `contributes.*` containers

- **Urgency:** med
- **Difficulty:** easy
- **File:** `/media/adam/extex/projects/thinkbrain-notes/packages/core/src/extensions/manifest.ts`
- **Lines:** 113, 178, 188

## Description

Three fields silently fall back to defaults when present but the wrong shape, producing
zero diagnostics:

- `readPlatforms` (line 113): `if (!isRecord(raw)) return DEFAULT_PLATFORMS;` — so
  `engines: "desktop"` or `engines: 5` is treated as if `engines` were absent, and the
  extension is marked as supporting **all** platforms. An author who typo'd the field
  shape gets an extension that claims mobile support it never asked for.
- `readContributions` (lines 178, 188):
  `Array.isArray(raw.commands) ? raw.commands : []` — `contributes: { commands: "x" }` or
  `commands: {}` silently yields an empty command list. The author's contributions just
  vanish with no hint why.

This is inconsistent with the rest of the parser, which is careful to report every
malformed field (`activationEvents`, `capabilities`, `main`, `contributes` itself all
emit `manifest_invalid_field` for wrong shapes). Given `evaluateCompatibility` gates on
`engines.platform`, the `engines` case is also a real correctness issue, not just a UX
nit — a malformed declaration expands to all platforms instead of failing closed.

## Recommendation

- In `readPlatforms`, distinguish `raw === undefined` (legitimate default) from present-
  but-not-a-record (emit `manifest_invalid_field`, then return `DEFAULT_PLATFORMS`).
- In `readContributions`, emit `manifest_invalid_field` when `raw.commands`/`raw.panels`
  is defined but not an array.

## Verification

Read manifest.ts:109-128 and 167-213. Confirmed `isRecord` excludes arrays
(settings/internal.ts:22-25), so an array-valued `engines` also hits the silent default.
Existing test `defaults the optional collections` (manifest.test.ts:47-59) only covers
the absent-field case, so adding diagnostics for present-but-malformed won't break it.
