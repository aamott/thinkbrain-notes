# Native Secret-Store Consumer Boundary

## Status

⬜ AI consumer story; storage implementation remains owned by `plans/extensions/pending-extension_secret_storage-med-hard.md`.

## Goal

Define how AI provider/ACP callers consume the extension-owned native secret store without duplicating keychain ownership, exposing values to React, or creating a second fallback.

## Exact likely files

- `apps/desktop/src-tauri/src/ai/credentials.rs` — AI-only consumer trait/request mapping; no OS-store implementation.
- `apps/desktop/src-tauri/src/commands/ai.rs` — invoke provider/agent secret reads through the consumer.
- `apps/desktop/src-tauri/src/ai/gateway.rs` and `src-tauri/src/ai/acp.rs` — accept an injected consumer, never a renderer secret.
- `apps/desktop/src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs` — register only normal AI commands; no raw secret command.
- `apps/desktop/src/native/ai.ts` — renderer-safe `CredentialPresence`/save/delete calls if the approved extension/native API exposes them; never `getSecret` result.
- `packages/core/src/ai/contracts.ts` — opaque `CredentialRef`/presence status only.
- `apps/desktop/src-tauri/src/ai/credentials_tests.rs` and integration tests — boundary assertions.

The extension-owned implementation and platform adapters belong only in the existing extension secret-storage story; do not modify that plan from this story.

## Rust/frontend contracts and typed boundary

The consumer takes `{extensionId: "assistant-chat", credentialKey: "provider:<providerId>"}` and returns either `SecretValue` internally or a redacted `CredentialPresence {configured: boolean}` to callers that do not need the value. `SecretValue` is non-serializable/private to the Rust process and must never be a Tauri command result, event field, log, panic, JSON setting, or error detail. Provider IDs and credential keys are validated against canonical extension namespace rules.

AI callers use an injected `SecretStoreConsumer` with scoped `get`, `set`, and `delete`; the consumer forwards to the extension/native boundary and does not list, bulk read, migrate, or fallback. If the OS store is unavailable, return a typed `secret_store_unavailable` error. AI uses stable built-in extension ID `assistant-chat` only after the beta built-in registration story approves the namespace.

## Dependencies and order

- Depends on the extension secret-storage API and canonical namespace decision.
- Blocks provider gateway credential use and ACP agent auth configuration.
- Runs before provider settings that save credentials.
- Does not block ACP text streaming for agents whose own auth is managed outside Thinkbrain; that path must still have no credential renderer exposure.

## Tests

- Unit: valid/invalid namespace, one-key scope, no bulk/list operation, error translation, secret lifetime not serializable.
- Integration: provider and ACP callers can read a configured secret in a fake consumer; renderer receives only presence; no secret appears in command return, Tauri event, logs, or serialized app settings.
- Negative: missing OS store fails loudly; no plaintext/encrypted app-data fallback; consumer cannot use another extension's namespace.

## Manual checks

Set a fake credential and exercise provider configuration; inspect React state, native event inspector, app-data JSON, logs, and error UI. Remove the credential and verify the UI reports unconfigured. Verify the AI module has no platform keychain dependency and only calls the extension-owned consumer.

## Local/cloud consent constraints and mobile implications

A stored credential is not consent to send context. Local model use remains offline; remote use still requires `remote-model` consent. On mobile, use the same native consumer contract with Android Keystore/iOS Keychain adapters supplied by the extension story; if unavailable, show an unavailable state rather than fallback or plaintext.

## Acceptance criteria

- [ ] AI callers use only the extension-owned scoped consumer; no duplicate keychain/fallback/list-all path exists.
- [ ] Secret values remain private to native code and never cross command/event/log/settings/history boundaries.
- [ ] Missing store, invalid namespace, deletion, and mobile-unavailable outcomes are typed and tested.

## Automated validation

Run Rust consumer/fake tests, native adapter/integration redaction tests, `pnpm lint`, `pnpm typecheck`, and `pnpm build`.

## Manual desktop/mobile checks

Desktop: exercise fake provider/ACP reads and deletion while inspecting renderer state, events, logs, and app-data. Mobile: verify approved secure-store behavior or explicit unavailable error without fallback.

## Non-goals

No OS credential-store implementation, encrypted app-data fallback, provider behavior, ACP lifecycle, permission UI, extension installation, secret settings form, or renderer-accessible secret getter.

## Handoff expectations

Deliver consumer trait/adapter, fake tests, namespace/redaction report, extension-owner integration note, platform matrix, and unresolved security questions.
