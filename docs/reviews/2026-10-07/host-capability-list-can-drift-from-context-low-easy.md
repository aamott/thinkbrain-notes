# `HOST_COMPATIBILITY.capabilities` is a hand-maintained copy of `DesktopExtensionContext`'s surface

- **Urgency:** low
- **Difficulty:** easy
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/extensions/hostCompatibility.ts`
- **Lines:** 18–22

## Description

The capability list `["commands", "panels", "editorHooks", "editorHeaders",
"tabs", "events", "workspace", "settings"]` is exactly the set of contribution
surfaces on `DesktopExtensionContext` — i.e. `keyof DesktopExtensionContext`
minus `extensionId` and `subscriptions` (which come from the core
`ExtensionContext`). Nothing ties the two together: a new surface added to the
context (e.g. `notifications`) without updating this list would silently emit
"capability unavailable" warnings for extensions that declare it, and a
misspelled entry is just as invisible.

## Recommendation

Add a compile-time completeness check — e.g.

```ts
type ContributionSurface = Exclude<keyof DesktopExtensionContext, keyof ExtensionContext>;
const surfaces: readonly ContributionSurface[] = [...];
// fails to compile if a surface is missing:
type _Exhaustive = Exclude<ContributionSurface, (typeof surfaces)[number]> extends never ? true : never;
```

or, simpler, a unit test asserting `capabilities` covers every key of a
constructed `DesktopExtensionContext`. A type-only import of
`DesktopExtensionContext` does not violate this module's deliberate "no value
imports" rule (the comment at the top is about runtime cycles; type imports
are erased).

## Verification

Compared hostCompatibility.ts:21 with `DesktopExtensionContext` members at
desktopExtensionHost.ts:129–147 — the eight names correspond one-to-one with
context keys other than `extensionId`/`subscriptions`. Greped `capabilities`
usage: `evaluateCompatibility` (compatibility.ts:136–145) treats missing
capabilities as warnings only, so drift degrades diagnostics rather than
breaking loading.
