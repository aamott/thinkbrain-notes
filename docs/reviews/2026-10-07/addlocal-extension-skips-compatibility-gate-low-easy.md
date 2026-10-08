# `addLocalExtension` never evaluates compatibility — the gate lives only in the loader

- **Urgency:** low
- **Difficulty:** easy
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/extensions/bootstrap.ts`
- **Lines:** 315–338 (`addLocalExtension`), vs. 254–273 (built-in path)

## Description

Built-ins are gated inside the bootstrap: `evaluateCompatibility` runs at line
254 and an incompatible extension is listed with reasons and contributes
nothing. `addLocalExtension` skips this entirely — it trusts that
`LocalDirectoryLoader.load` already ran the check (it does,
`localDirectoryLoader.ts:121–125`), so an incompatible extension can't arrive
through the only current caller.

But `addLocalExtension` is a public method on `ExtensionBootstrap`, and the
bootstrap even holds the injected `compatibilityHost` that would let it check.
Any future caller that produces a `LoadedExtension` without the loader — a
remote install, an unpacked archive, a test — bypasses the platform/apiVersion
gate and gets stubs plus lazy activation for an extension the host knows it
can't run. The two descriptors can also drift: the loader and the bootstrap
each accept their own `compatibilityHost` option.

## Recommendation

Run `evaluateCompatibility(manifest, compatibilityHost)` in
`addLocalExtension` the same way the built-in loop does: on `compatible ===
false`, insert the entry with `status: "incompatible"` and the reasons, skip
`registerAndStub`, and still `rebuildSnapshot()` so the panel can show why.
That keeps the gate at the registry boundary regardless of which loader fed
the extension in.

## Verification

Read bootstrap.ts:254–273 (built-ins get `evaluateCompatibility` +
`incompatible` status) vs. 315–338 (`addLocalExtension` goes straight to
`registerAndStub`). The loader-side gate is at localDirectoryLoader.ts:121–125
and is the sole producer of `LoadedExtension` today
(`localExtensions.ts:87–103`).
