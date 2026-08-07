# Capability Declarations and Compatibility Gates (Superseded Alias)

## Status

⬜ Superseded as an implementation plan. The beta does **not** implement a capability sandbox. Use `done-extension_capability_compatibility-low-med.md` for the canonical soft-gate contract.

## Goal

Keep the historical capability story from being mistaken for hostile-extension isolation. Capabilities are typed declarations, compatibility/documentation signals, and platform availability gates; trusted same-context extensions still have app privileges.

## Discovery questions

See the canonical story for the capability vocabulary, activation policy, platform matrix, API range, and warning copy.

**Stop-and-ask gate:** Do not add sandbox, iframe/process isolation, signing, or permission enforcement under this alias. Ask the product/security owner before reopening any deferred threat-model work.

## Prerequisites

`plans/extensions/done-extension_manifest_format-low-med.md` and `plans/extensions/done-extension_capability_compatibility-low-med.md`.

## Exact likely file areas

Canonical implementation is documented in `done-extension_capability_compatibility-low-med.md`; no code should be added for this alias.

## Implementation tasks

1. Link consumers to the canonical soft-compatibility story.
2. Preserve the explicit non-sandbox wording in future docs/tests.
3. Reopen only through an approved threat-model decision.

## Acceptance criteria

- [ ] No implementation is claimed by this alias.
- [ ] Canonical soft-gate story owns compatibility work.
- [ ] Strong isolation remains deferred.

## Automated validation

Repository search should show no new sandbox/security-enforcement symbols from extension beta work; run normal lint/typecheck/build after canonical work.

## Manual desktop/mobile checks

Verify any extension status copy says “trusted app privileges” and never “sandboxed,” on desktop and mobile.

## Non-goals

Sandboxing, permissions, signing, installer, URL/marketplace, or native isolation.

## Handoff artifacts

Canonical-story link and explicit threat-model reopen gate.

## References

- `plans/extensions/done-extension_capability_compatibility-low-med.md`
- `plans/technical-decisions.md`
