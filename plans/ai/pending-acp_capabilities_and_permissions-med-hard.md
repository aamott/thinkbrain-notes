# ACP Capabilities and Permissions

## Goal

Expose workspace-scoped ACP filesystem and terminal capabilities through Tauri
while keeping user consent, enforcement, and agent decision-making separate.

## Acceptance Criteria

- [ ] Filesystem read/write/rename/delete and terminal capability adapters
      validate workspace scope, canonical paths, allowlists, and revocation at
      the native host boundary.
- [ ] Agent permission requests render a consistent assistant-panel/modal flow
      with request details and allow once, always allow, and deny decisions.
- [ ] Stored allow-always rules are narrow, inspectable, revocable, and kept in
      OS app-data; Rust, not React, enforces every decision.
- [ ] Stale writes return current content/conflict information without automatic
      merging; the agent decides how to retry.
- [ ] Tests cover scope escape, denied/revoked permission, allow-once expiry,
      terminal stream/cancel, stale write, and renderer event mapping.

## References

- `.agents/skills/acp/SKILL.md`
- `apps/desktop/src/native/commands.ts`
- `apps/desktop/src-tauri/capabilities/default.json`
- `plans/ai.md`
