# ACP Capabilities, Consent, and Permission Requests

## Status

🟨 Superseded rollup. Native capability enforcement and renderer permission-consent UI are separate focused child stories listed below; this file owns no implementation checklist.

## Focused child stories

- `pending-acp_capability_enforcement-med-hard.md` — native validation, grants, and operation enforcement.
- `pending-acp_permission_consent_ui-med-med.md` — approved desktop/mobile request presentation and response flow.

## Discovery questions and STOP gate

The focused children must resolve exact risk copy for read/write/rename/delete/terminal, allow-once versus allow-always scope, grant inspection/revocation, deny behavior, mobile terminal presentation, and the current ACP `session/request_permission`/`PermissionOption` shapes. **STOP:** do not create permission mockups or code until product/security answers are recorded and the official ACP shapes are verified.

## Dependencies and boundary

Both children depend on the ACP host lifecycle, AI contracts/consent, and official ACP spec verification. Native enforcement precedes renderer UI. Remote-model/context consent remains separate from ACP capability consent; secret storage remains extension-owned.

## Acceptance criteria

- [ ] Child ownership is non-overlapping: Rust validates/enforces; renderer only presents approved options and submits selections.
- [ ] No permission behavior is claimed complete by this rollup.
- [ ] Child handoffs preserve session filtering, redaction, no auto-approval, typed unavailable states, and mobile constraints.

## Automated validation

Run both child-story test suites plus `pnpm lint`, `pnpm typecheck`, and `pnpm build`; this rollup has no implementation target.

## Manual desktop/mobile checks

Use the child checks to verify request filtering, explicit decisions, cancellation/error handling, redaction, and mobile no-terminal assumptions.

## Non-goals

No provider gateway, secret-store implementation, ACP host lifecycle, arbitrary shell execution, agent planning, conflict merging, history, extension installation, or UI/code before child STOP gates.

## Handoff expectations

Keep official ACP version/spec, product/security answers, child status, and unresolved questions linked here. Child paths are likely until implementation confirms them.

## References

- `plans/ai/pending-acp_host_runtime-med-hard.md`
- `plans/ai/pending-ai_contracts_and_consent-low-hard.md`
- `plans/ai/pending-acp_capability_enforcement-med-hard.md`
- `plans/ai/pending-acp_permission_consent_ui-med-med.md`
