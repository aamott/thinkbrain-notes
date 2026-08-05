# Story: Mobile Tauri Config

**Status:** pending · **Urgency:** low · **Difficulty:** easy

## Goal

Configure mobile-specific Tauri permissions and capabilities. Desktop-only
commands (terminal, process-spawn) are gated out of mobile builds. Mobile
capabilities are more restrictive than desktop. Create `tauri.android.conf.json`
and `tauri.ios.conf.json` if needed.

## Acceptance Criteria

- [ ] Mobile builds do not include desktop-only commands (terminal,
      process-spawn).
- [ ] Capability enforcement works on mobile (extensions cannot invoke
      desktop-only commands).
- [ ] Desktop builds are unchanged.
- [ ] `./scripts/qa.sh` passes.

## References

- `plans/pending-mobile-low-hard.md` — capability gating decision
- `plans/pending-extensions-low-hard.md` — platform-aware capabilities
