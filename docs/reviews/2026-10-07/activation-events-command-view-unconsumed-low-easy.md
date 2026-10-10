# `onCommand:`/`onView:` activation events are parsed and validated but never consumed

- **Urgency:** low
- **Difficulty:** easy
- **File:** `/media/adam/extex/projects/thinkbrain-notes/packages/core/src/extensions/activation.ts`
- **Lines:** 12-37

## Description

`parseActivationEvent` produces `command` and `view` kinds, and `manifest.ts` validates
their syntax — but no code path ever acts on them. Repo-wide grep shows the only
non-test consumer of activation events is `hasStartupActivation` (bootstrap.ts:219),
which only cares about `"onStartup"`. Actual lazy activation is driven by *stub
registration*: touching a contributed command or panel calls `ensureActive`
(bootstrap.ts:151-188) regardless of what `activationEvents` says.

So an extension that omits `onCommand:show` still activates when `show` is invoked —
declared events beyond `onStartup` are documentation the host doesn't honor, and a
manifest author could reasonably believe `activationEvents: []` disables activation.
(Conversely this may be intentional forward-looking API; if so it deserves a comment.)

## Recommendation

Either wire the parsed `command`/`view` kinds to the trigger points (e.g. only install
stubs for contributed commands listed in `activationEvents`, matching VS Code-style
semantics), or document in the module docstring that non-startup events are currently
advisory and stubs own lazy activation. If the intent is "any contribution touch
activates", consider whether `activationEvents` entries beyond `onStartup` should warn.

## Verification

`grep "parseActivationEvent|hasStartupActivation"` repo-wide: only bootstrap.ts:219
consumes it, via `hasStartupActivation` → `kind === "startup"` (activation.ts:40-42).
Read bootstrap.ts:151-223 — `registerStubs` ignores `activationEvents` entirely; the
stub handler calls `ensureActive` unconditionally.
