# Extension Native Secret Storage

## Status

⬜ Not implemented. No extension-scoped OS credential adapter exists. The encrypted app-data fallback is intentionally undecided and must not be implemented here.

## Goal

Provide a typed Rust/native boundary for one extension and credential key at a time, using the platform credential store and never JSON settings, workspace files, logs, renderer-wide state, or bulk cross-extension reads.

## Discovery questions

- Which credential-store crate and minimum OS versions are approved for macOS Keychain, Windows Credential Manager, and Linux Secret Service/equivalent?
- What service/account naming and migration preserve extension isolation?
- Are mobile Keychain/Keystore adapters in beta, and what unavailable behavior is acceptable?
- Which operations beyond get/set/delete are needed?
- What consent/error copy is required when the store is unavailable or locked?

**Stop-and-ask gate:** Do not choose a crate, fallback, mobile implementation, naming scheme, or user-facing failure behavior until security/platform owners answer these questions. An unavailable OS store is an explicit error; never invent plaintext or improvised encryption.

## Prerequisites

- Canonical extension id/parser and native gateway conventions in `plans/wip-ai-low-hard.md`.
- Scoped settings/API boundary and ACP/provider consumer requirements.
- Tauri capability conventions in `apps/desktop/src-tauri/capabilities/`.

## Exact likely file areas

- Rust `apps/desktop/src-tauri/src/commands/secrets.rs` (or approved module), typed errors in `src/error.rs`, registration in `src/lib.rs`, and Rust fakes/tests.
- `apps/desktop/src/native/commands.ts` and narrow `src/native/secrets.ts` adapter/tests.
- `apps/desktop/src-tauri/Cargo.toml` dependency/target conditionals only after approval.

## Implementation tasks

1. Record security/platform decisions and define a service/account namespace including canonical extension id and credential key.
2. Implement typed Rust get/set/delete with strict id/key validation, no list-all/bulk operations, redacted errors/logging, and fake adapter injection.
3. Implement approved platform adapters and target-specific unavailable errors; test isolation/error mapping/no-value logging.
4. Add TS adapter and integration proof that ACP/provider callers use it rather than settings JSON; keep values out of general state/events.
5. Document uninstall deletion and rotation semantics without implementing UI/provider behavior.

## Acceptance criteria

- [ ] Desktop adapters use approved OS stores and fail loudly when unavailable.
- [ ] Operations are scoped to one canonical extension id/key; no list/read-other API exists.
- [ ] Secret values do not enter JSON, workspace, logs, general UI state, or broad events.
- [ ] Rust/TS errors are typed/tested; mobile behavior is explicit.
- [ ] No encrypted fallback ships without a separate approved decision.

## Automated validation

- `pnpm test:rust` with fakes/target adapter tests.
- Desktop adapter/integration tests and redaction assertions.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`.

## Manual desktop/mobile checks

- Desktop: store/retrieve/delete a fixture credential, inspect no leakage, test unavailable-store error.
- Mobile: verify approved Keychain/Keystore behavior or clear unsupported error; no plaintext fallback.

## Non-goals

No encrypted fallback, credentials UI, provider/ACP behavior, marketplace, installer, signing, or sandbox.

## Handoff artifacts

- Security decision record, Rust/TS adapter/fake tests, platform matrix, namespace/deletion contract, and consumer migration notes.

## References

- `plans/technical-decisions.md`
- `plans/wip-ai-low-hard.md`
- `plans/extensions/pending-extension_settings-low-med.md`
