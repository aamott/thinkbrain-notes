# Extension Native Secret Storage

## Status

⬜ Not implemented. No extension-scoped OS credential adapter exists. The
encrypted app-data fallback is intentionally undecided and must not be
implemented here.

## Goal

Typed Rust/native boundary for one extension + credential key at a time,
using the platform credential store — never JSON settings, workspace files,
logs, renderer-wide state, or bulk cross-extension reads.

## Direction set by the mobile epic

The backend question has a drafted answer: **keyring v4 (`keyring-core`) plus
per-platform store crates**, with `android-native-keyring-store` on Android —
see `docs/superpowers/specs/2026-08-27-android-git-access-design.md` and
`keyring_v4_migration`. One default store per platform at startup gives this
story an `Entry`-shaped boundary covering desktop and Android. What remains
is extension-scoped naming, isolation, and the API surface — not the backend
choice, and still not an encrypted fallback.

## Discovery questions (stop-and-ask gate)

Approved crate + minimum OS versions (macOS Keychain, Windows Credential
Manager, Linux Secret Service)? Service/account naming and migration that
preserve extension isolation? Mobile Keychain/Keystore adapters in beta, and
acceptable unavailable behavior? Operations beyond get/set/delete?
Consent/error copy when the store is unavailable or locked?

An unavailable OS store is an explicit error — never invent plaintext or
improvised encryption.

## Prerequisites

- Canonical extension id/parser; native gateway conventions once `plans/ai/`
  gets its planning pass; scoped settings/API boundary; ACP/provider consumer
  requirements; Tauri capability conventions in `src-tauri/capabilities/`.

## Likely files

- Rust `apps/desktop/src-tauri/src/commands/secrets.rs` (or approved module),
  typed errors in `src/error.rs`, registration in `src/lib.rs`, fakes/tests;
  `Cargo.toml` target conditionals only after approval.
- `apps/desktop/src/native/commands.ts` + narrow `src/native/secrets.ts`
  adapter/tests.

## Acceptance criteria

- [ ] Desktop adapters use approved OS stores and fail loudly when
      unavailable.
- [ ] Scoped to one canonical extension id/key; no list/read-other API.
- [ ] Secret values never enter JSON, workspace, logs, UI state, or events.
- [ ] Rust/TS errors typed/tested; mobile behavior explicit.
- [ ] No encrypted fallback ships without a separate approved decision.

## Validation

`pnpm test:rust` with fakes/adapter tests; desktop adapter/integration tests
with redaction assertions; `pnpm lint`, `pnpm typecheck`, `pnpm build`;
manual store/retrieve/delete + unavailable-store checks.

## Non-goals

No encrypted fallback, credentials UI, provider/ACP behavior, marketplace,
installer, signing, or sandbox.

## References

- `plans/ai/`, `extensions/extension_settings`
