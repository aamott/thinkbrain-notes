# Extension Secret Storage

## Goal

Provide a Rust/native secret-storage boundary for extension credentials without
placing secrets in JSON settings, workspace files, or renderer state. The first
implementation should use operating-system credential stores through explicit
platform adapters. The encrypted app-data fallback is a separate decision and is
explicitly deferred by this story.

This story owns storage and scoped access only. Provider behavior, ACP session
behavior, and settings UI remain in their existing stories and epics.

## Acceptance Criteria

- [ ] A typed Rust/native secret-storage interface supports scoped get, set, and
      delete operations for one extension and credential key at a time.
- [ ] Desktop adapters use the platform credential store where available:
      macOS Keychain, Windows Credential Manager, and Linux Secret Service (or
      the platform-supported equivalent).
- [ ] The native boundary validates the canonical extension namespace and does
      not expose bulk/raw cross-extension reads or list-all-secrets operations.
- [ ] Renderer and extension APIs receive only scoped operation results; secret
      values do not enter JSON settings, workspace files, logs, or general UI
      state.
- [ ] Native errors are typed and fail loudly when the platform store is
      unavailable or an operation is unauthorized.
- [ ] Unit tests cover namespace isolation, adapter mapping, and error paths;
      platform-specific adapter tests use fakes or supported host runners.
- [ ] Integration coverage verifies that ACP/provider credential callers use the
      native boundary rather than JSON settings.

## Deferred decision: encrypted app-data fallback

The fallback is intentionally not selected or implemented here. Before any
fallback is added, a separate decision must establish key management, platform
protection assumptions, migration, backup behavior, and the user-facing warning
when no OS credential store is available. Until that decision is approved, an
unavailable OS store is an explicit error rather than permission to persist a
plaintext or improvised encrypted copy.

## Dependencies and boundaries

- Depends on the native gateway conventions in `plans/wip-ai-low-hard.md` and
  the extension boundary in `plans/pending-extensions-low-hard.md`.
- The Extension Settings story consumes this boundary for credentials but keeps
  non-secret settings in the existing namespaced JSON registry.
- The beta built-in integration story may register credential consumers for ACP
  Agent Chat; it does not define provider behavior or fallback storage.
- No marketplace, install-from-URL, extension signing, or settings UI work is
  included.

## References

- `plans/pending-extensions-low-hard.md` — extension boundary and status
- `plans/extensions/pending-extension_settings-low-med.md` — scoped non-secret
  settings and credential boundary
- `plans/wip-ai-low-hard.md` — native gateway and credential ownership
- `plans/ai/pending-provider_configuration_and_gateway-med-hard.md` — provider
  configuration behavior
