# Story: Mobile Tauri Config

## Goal

Configure mobile-specific Tauri settings and platform capability declarations.
Desktop-only commands (terminal, process-spawn) are unavailable on mobile and
must not be invoked there. Declarations are soft compatibility/unavailable
behavior, not security enforcement. Create `tauri.android.conf.json` and
`tauri.ios.conf.json` if needed.

## Acceptance Criteria

- [ ] Mobile builds report desktop-only commands (terminal, process-spawn) as
      unavailable and do not invoke them.
- [ ] Capability declarations are documented and handled as soft compatibility
      signals, not a security sandbox or hostile-extension boundary.
- [ ] Desktop builds are unchanged.
- [ ] `./scripts/qa.sh` passes.

## References

- `plans/pending-mobile-low-hard.md` — capability gating decision
- `plans/pending-extensions-low-hard.md` — platform-aware capabilities
