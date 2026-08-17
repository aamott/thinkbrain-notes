# ACP Native Capability Enforcement

## Status

⬜ Focused native child story. ACP host lifecycle must be available first; renderer permission UI is separate.

## Goal

Validate and enforce ACP filesystem/terminal requests in Rust with workspace scope, typed grants, revocation, rechecks, and no renderer authorization.

## Discovery questions and STOP gate

- Which operation/path/command scopes, grant persistence, expiry, and revocation semantics are approved?
- What terminal policy and mobile unavailable behavior are supported?
- Which exact official ACP request/response shapes and crate APIs apply?

**STOP gate:** Do not implement enforcement until product/security answers are recorded and the current official ACP spec/crate shapes are verified.

## Dependencies

- AI contracts/consent and ACP host/session lifecycle.
- Native app-data conventions and extension-owned secret boundary; no new secret storage.
- No dependency on permission UI; use fake request/response fixtures.

## Likely files

- `apps/desktop/src-tauri/src/ai/capabilities.rs`, `permissions.rs`, and focused tests (likely).
- `apps/desktop/src-tauri/src/commands/acp.rs`, `commands/mod.rs`, `lib.rs`, capabilities manifest only as required.
- `apps/desktop/src/native/acp.ts` only for typed redacted request/result adapters if needed.

## Small task sequence

1. Record official ACP shapes, operation matrix, path/command policy, and grant schema.
2. Implement canonical workspace/symlink/path validation and typed allow/deny decisions.
3. Add bounded grant persistence, allow-once expiry, allow-always matching, revocation, and recheck.
4. Integrate host request/response plumbing and test failures/disconnects without UI.

## Acceptance criteria

- [ ] Rust independently validates every operation and never auto-approves from renderer input.
- [ ] Path escapes, symlink escapes, malformed IDs, unsafe commands, stale writes, and unavailable mobile capabilities return typed results.
- [ ] Grants are scoped, revocable, bounded, redacted, and stored outside the workspace; no secret value is logged or emitted.
- [ ] No host planning/editing/merging or arbitrary shell bypass is introduced.

## Automated validation

Rust unit/integration tests with mock ACP requests cover path/command scope, grant lifecycle, stale writes, cancellation, disconnect, redaction, and mobile-unavailable fixtures; run `cargo test`, `pnpm lint`, and `pnpm typecheck`.

## Manual desktop/mobile checks

Desktop: mock read/write/rename/delete/terminal requests and verify allow/deny/revoke/expiry, symlink/path rejection, and conflict results. Mobile: verify capability-unavailable responses and no PATH/PTY assumption.

## Non-goals

No permission modal/UI, provider gateway, secret storage, history, context injection, Git sync, extension install, or host-side planning/merge.

## Handoff expectations

Deliver official ACP spec/version note, enforcement matrix, typed Rust contracts/tests, grant persistence/revocation report, security decisions, and unresolved user questions. Concrete paths remain likely.

## References

- `plans/ai/pending-acp_host_runtime-med-hard.md`
- `plans/ai/pending-ai_contracts_and_consent-low-hard.md`
