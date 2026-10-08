# Manifest parser accepts duplicate contribution ids that later explode at registration

- **Urgency:** med
- **Difficulty:** easy
- **File:** `/media/adam/extex/projects/thinkbrain-notes/packages/core/src/extensions/manifest.ts`
- **Lines:** 167-214 (`readContributions`)

## Description

`readContributions` validates each contributed command/panel id's shape but never checks
for duplicates *within* a kind. A manifest declaring two commands with `id: "show"` parses
clean. Downstream, `bootstrap.ts` `registerStubs` registers each as
`${manifest.id}.${command.id}` into `createContributionRegistry`, which **throws** on a
duplicate id (contributions.ts:77-81).

`registerStubs` is called outside the transactional try/catch in `registerAndStub`
(bootstrap.ts:219-223). For a local extension this means `states.set(...)` and
`host.register(...)` have already run when the second duplicate stub throws: the extension
ends up registered in the host with a partially-stubbed contribution set, while
`localExtensions.ts:93-101` reports the load as failed. Half-state with no rollback.

## Recommendation

In `readContributions`, track a `Set<string>` of seen ids per kind and push an
`manifest_invalid_field`-style error (e.g. `manifest_duplicate_contribution_id`) when an
id repeats, skipping the duplicate. Only dedupe within `commands` and within `panels`
separately — the same relative id across kinds is legitimate (the `hello-notes` example
uses `capture` for both a command and a panel).

## Verification

Read manifest.ts:177-211 — no `Set`/seen check exists. Read
contributions.ts:77-81 (`throw new Error('A contribution is already registered…')`) and
bootstrap.ts:151-188 (`registerStubs`), 219-223 (called outside the try at 200-218).
Greped `duplicate` in the extensions dirs — no manifest-level dedupe exists anywhere.
