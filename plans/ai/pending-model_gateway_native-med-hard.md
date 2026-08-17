# AI Native Model Gateway

## Status

⬜ Focused native transport child. Provider configuration UI and ACP host remain separate owners.

## Goal

Implement typed Rust local/remote model transport, cancellation, bounded streaming, provider allowlists, explicit remote-model consent, redaction, and native secret-consumer access.

## Discovery questions and STOP gate

- Which local runtime/remote endpoints and HTTP/stream formats are approved?
- What timeout, response-size, cancellation, retry, and unavailable secure-store behavior is required?
- Which network/remote-model consent copy and mobile backgrounding policy are approved?

**STOP gate:** Do not implement provider transport, endpoint policy, or gateway integration until product/security answers are recorded and the official provider contracts are approved. No UI mockup/code is included here.

## Dependencies

- AI contracts/consent and native secret-store consumer boundary.
- Approved provider configuration contract; fake local server for tests.
- Native Tauri command/event conventions; no renderer credential access.

## Likely files

- `apps/desktop/src-tauri/src/ai/provider_registry.rs`, `gateway.rs`, `error.rs`, `commands/ai.rs` and tests (likely).
- `apps/desktop/src/native/ai.ts`, `native/commands.ts` for typed secret-free adapters.
- `apps/desktop/src-tauri/src/commands/mod.rs`, `lib.rs`, capabilities manifest only as required.

## Small task sequence

1. Record provider/endpoint/stream/error/consent matrix and redaction limits.
2. Implement allowlisted provider metadata and local/remote policy checks.
3. Implement native secret-consumer lookup, bounded request/stream/cancel, and typed errors/events.
4. Add fake-server integration and mobile/unavailable/cancellation validation.

## Acceptance criteria

- [ ] Gateway uses only approved providers/endpoints and blocks remote calls without explicit `remote-model` consent.
- [ ] Secrets remain private to Rust/native consumer; no command/event/log/error/history payload contains credentials.
- [ ] Streams are request/sequence filtered, bounded, cancellable, timeout-safe, and redacted.
- [ ] Mobile endpoint/process/background limitations are typed and do not assume desktop PATH/runtime.

## Automated validation

Rust unit/integration tests with fake local/remote servers cover allowlists, consent refusal, stream parse/timeout/cancel, redaction, errors, and secure-store unavailable; run `cargo test`, `pnpm lint`, `pnpm typecheck`, and `pnpm build`.

## Manual desktop/mobile checks

Desktop: stream/cancel from a fake local server, block remote without consent, inspect app-data/events/logs for secrets, and test timeout/store-unavailable errors. Mobile: test network transitions, suspension cancellation, secure-store availability, and unsupported runtime states.

## Non-goals

No provider settings UI, SDK in core/renderer, ACP lifecycle/permissions, history, context injection, semantic search, secret-store implementation, or extension installation.

## Handoff expectations

Deliver provider/endpoint/consent decision record, native command/event contract, fake-server tests, redaction/cancellation report, mobile matrix, and unresolved user questions. Concrete paths remain likely.

## References

- `plans/ai/pending-ai_contracts_and_consent-low-hard.md`
- `plans/ai/pending-native_secret_store_consumer_boundary-med-hard.md`
