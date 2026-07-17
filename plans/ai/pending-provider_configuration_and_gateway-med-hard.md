# Provider Configuration and Native Gateway

## Goal

Define platform-neutral model configuration and implement the native gateway
that owns local/remote provider requests, credentials, and network consent.

## Acceptance Criteria

- [ ] `packages/core/src/ai/` exports provider/model configuration, session,
      consent, and typed error value contracts with no framework or provider
      dependency.
- [ ] Desktop settings support built-in local and remote provider configuration,
      validation, model selection, and an explicit cloud opt-in.
- [ ] Credentials use the OS secret store when available (with documented,
      encrypted app-data fallback); they are never stored in the vault, React
      state, plain workspace settings, or native event payloads.
- [ ] Rust/native gateway owns provider requests, streaming, cancellation, and
      outbound network policy behind typed Tauri commands.
- [ ] Tests cover absent/invalid configuration, a local-only flow, cloud consent
      refusal, redaction, and typed provider failures.

## References

- `packages/core/src/index.ts`
- `apps/desktop/src/settings/`
- `apps/desktop/src-tauri/src/`
- `plans/technical-decisions.md` — AI and Settings
