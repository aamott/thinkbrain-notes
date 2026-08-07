# Assistant Panel Foundation

## Goal

Provide the assistant-ui panel foundation that the fresh right popout mounts
before an ACP host is configured. Its runtime and presentation behavior are in
place, but the production source still uses Tailwind utility classes rather than
co-located CSS Modules; the binding `--tn-*` styling migration remains pending.
See `plans/theme-foundation/pending-surface_styling_migration-med-med.md`.

## Acceptance Criteria

- [x] Uses `@assistant-ui/react` runtime/provider and thread primitives rather
      than a parallel handcrafted chat transcript.
- [x] Clearly communicates that an Agent session must be configured; it does
      not simulate provider output or store history in the vault or browser
      storage.
- [x] Supports keyboard focus, narrow panel sizing, and
      empty/error/configuration presentation.
- [ ] Production renderer styling uses co-located CSS Modules backed by shared
      `--tn-*` tokens, with no Tailwind utility classes or inline styles; this
      styling migration remains pending (see
      `plans/theme-foundation/pending-surface_styling_migration-med-med.md`).
- [x] Has no credentials, network calls, provider implementation, or ACP
      session lifecycle logic in React.
- [x] Leaves the `agent_chat_text_streaming_mvp`,
      `assistant_ui_desktop_thread`, ACP, and history stories pending for
      their actual behavior.

## References

- `mockup_v3/src/components/RightPopout.tsx`
- `plans/ai/pending-agent_chat_text_streaming_mvp-high-hard.md`
- `plans/ai/pending-assistant_ui_desktop_thread-med-med.md`
- `.agents/skills/acp/SKILL.md`
