# Provider Configuration and Native Gateway

## Status

🟨 Superseded rollup. Provider configuration/registry and native model transport are separate focused child stories listed below; this file owns no implementation checklist.

## Focused child stories

- `pending-provider_configuration_ui-low-med.md` — approved non-secret settings and provider metadata.
- `pending-model_gateway_native-med-hard.md` — Rust model transport, cancellation, consent, redaction, and stream events.

## Discovery questions and STOP gate

The focused children must resolve the supported local runtime, remote providers/endpoints, connectivity-probe policy, model-switch scope, OS-store-unavailable copy, and approved desktop/mobile settings layout. **STOP:** no provider mockups, UI, provider integration, or gateway implementation until product answers are recorded; native contract work may proceed only after AI contracts and secret-consumer boundaries are accepted.

## Dependencies and boundary

Both children depend on AI contracts/consent and the native secret-store consumer. The configuration child owns non-secret metadata/settings UI; the gateway child owns Rust transport/stream/cancel/consent. Neither owns ACP lifecycle, history, context, or a second keychain/fallback.

## Acceptance criteria

- [ ] Both focused children are linked and have non-overlapping ownership.
- [ ] No provider UI or gateway behavior is claimed complete by this rollup.
- [ ] Handoffs preserve secret-free renderer/events, explicit remote-model consent, bounded/cancellable streams, and mobile constraints.

## Automated validation

Run both child-story suites plus `pnpm lint`, `pnpm typecheck`, and `pnpm build`; this rollup has no implementation target.

## Manual desktop/mobile checks

Use child checks to verify settings/gateway states, remote-consent refusal, cancellation, redaction, secure-store unavailable behavior, and mobile suspension/network limitations.

## Non-goals

No provider implementation in core/renderer, ACP lifecycle, secret-store implementation, history, context injection, semantic-search bridge, extension install, or UI/code before child STOP gates.

## Handoff expectations

Keep product/provider/security answers, child status, contract/event decisions, and unresolved questions linked here. Child paths remain likely until implementation confirms them.

## References

- `plans/ai/pending-ai_contracts_and_consent-low-hard.md`
- `plans/ai/pending-native_secret_store_consumer_boundary-med-hard.md`
- `plans/ai/pending-provider_configuration_ui-low-med.md`
- `plans/ai/pending-model_gateway_native-med-hard.md`
