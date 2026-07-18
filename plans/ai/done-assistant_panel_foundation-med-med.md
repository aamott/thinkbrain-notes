# Assistant Panel Foundation

## Goal

Provide the CSS-Module-themed assistant-ui panel that the fresh right popout
mounts before a provider, AI SDK transport, or ACP host is configured.

## Acceptance Criteria

- [x] Uses `@assistant-ui/react` runtime/provider and thread primitives rather
      than a parallel handcrafted chat transcript.
- [x] Clearly communicates that a model or Agent session must be configured;
      it does not submit to `/api/chat`, simulate provider output, or store
      history in the vault or browser storage.
- [x] Supports keyboard focus, narrow panel sizing, empty/error/configuration
      presentation, and the shared `--tn-*` token themes.
- [x] Has no credentials, network calls, provider implementation, or ACP
      session lifecycle logic in React.
- [x] Leaves the `ai_sdk_tauri_transport`, `assistant_ui_desktop_thread`, ACP,
      and history stories pending for their actual behavior.

## References

- `mockup_v3/src/components/RightPopout.tsx`
- `plans/ai/pending-ai_sdk_tauri_transport-med-hard.md`
- `plans/ai/pending-assistant_ui_desktop_thread-med-med.md`
- `.agents/skills/acp/SKILL.md`
