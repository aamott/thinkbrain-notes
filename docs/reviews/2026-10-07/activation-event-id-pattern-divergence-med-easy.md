# Activation-event id pattern diverges between manifest validation and parsing

- **Urgency:** med
- **Difficulty:** easy
- **File:** `/media/adam/extex/projects/thinkbrain-notes/packages/core/src/extensions/manifest.ts`
- **Lines:** 72 (also `activation.ts:32`)

## Description

`manifest.ts` validates activation events with
`KNOWN_ACTIVATION_EVENTS = /^(onStartup|onCommand:[a-z][a-z0-9-]*|onView:[a-z][a-z0-9-]*)$/`,
where the id portion is `[a-z][a-z0-9-]*`. `activation.ts` parses the same events with
`EXTENSION_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/` (lifecycle.ts:156).

The manifest pattern is strictly looser: it accepts ids the parser then rejects, e.g.
`onCommand:show-` (trailing hyphen) or `onCommand:a--b` (empty segment). Those events
produce **no diagnostic at all** — the manifest pattern says they are supported, so no
`manifest_unknown_activation_event` warning is emitted — yet `parseActivationEvent`
returns `null` for them, so the extension simply never activates for that trigger. The
author gets a clean bill of health and a silently dead activation event.

## Recommendation

Derive the manifest check from the same source of truth. Either embed
`EXTENSION_ID_PATTERN.source` inside `KNOWN_ACTIVATION_EVENTS`
(e.g. `new RegExp(`^(onStartup|onCommand:${EXTENSION_ID_PATTERN.source.slice(1, -1)}|onView:…)$`)`),
or simpler: replace the regex check in `parseExtensionManifest` with a call to
`parseActivationEvent(event)` and warn when it returns `null`. The latter also keeps the
two copies from drifting if a new event kind is added.

## Verification

Read `manifest.ts:72` and `activation.ts:24-37`. Traced `onCommand:show-`:
`[a-z][a-z0-9-]*` matches `show-` (allowed trailing `-`), so no warning is pushed
(manifest.ts:255-266). `parseActivationEvent("onCommand:show-")` extracts id `show-`,
fails `EXTENSION_ID_PATTERN` at activation.ts:32, returns `null`, and
`hasStartupActivation`/any future trigger lookup ignores it.
