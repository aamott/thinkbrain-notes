# ACP Permission Consent UI

## Status

⬜ Focused UI child. Native capability enforcement and official ACP shape verification must land before this story.

## Goal

Present filtered ACP permission requests as untrusted agent-provided text, let users choose only valid options, and report approved denial/cancellation states without authorizing operations in React.

## Discovery questions and STOP gate

- What exact risk copy, option labels, allow-once/always scope, inspect/revoke affordance, and error/retry behavior are approved?
- How do desktop narrow layouts and mobile VoiceOver/TalkBack present terminal requests and long paths?
- Which current ACP option shapes are verified by the host child?

**STOP gate:** Do not create modal mockups, JSX, CSS, or screenshots until answers, current ACP shapes, and iterative desktop/mobile mockup approvals are recorded.

## Dependencies

- ACP host lifecycle, native capability enforcement, AI contracts/consent, and approved panel foundation.
- Existing assistant panel/runtime and native event adapters; React never calls Tauri directly.

## Likely files

- `apps/desktop/src/agent/permissionModel.ts`, `PermissionRequest.tsx`, and tests (likely).
- `apps/desktop/src/native/acp.ts`, `src/native/commands.ts` for typed request/decision adapters.
- Existing `AssistantPanel.tsx` only after approved mockups; no second panel registry.

## Small task sequence

1. Record approved state/copy/accessibility matrix and desktop/mobile mockup versions.
2. Map redacted, session-filtered native requests into a renderer-safe model.
3. Implement option selection, cancellation, denial, and loading/error states after STOP.
4. Add keyboard, screen-reader, narrow/mobile, and stale-request tests.

## Acceptance criteria

- [ ] UI renders only session-filtered, agent-supplied options as untrusted text and cannot authorize directly.
- [ ] Approved decision scope and exact option ID are sent through typed adapters; invalid/stale requests are rejected.
- [ ] Desktop/mobile layout, focus, labels, live announcements, reduced motion, and unavailable terminal state match approved mockups.
- [ ] Renderer styling uses co-located CSS Modules with shared `--tn-*` tokens; no Tailwind utility classes or inline styles.
- [ ] No secrets, raw command environment, or hidden cloud consent appear in UI/state.

## Automated validation

Run React/native adapter tests for normal, denied, cancelled, stale, error, redaction, keyboard, and narrow layouts plus `pnpm lint`, `pnpm typecheck`, and `pnpm build`.

## Manual desktop/mobile checks

Desktop: exercise mock requests, long paths, allow/deny/cancel/revoke states, focus restoration, and error recovery. Mobile: test keyboard, VoiceOver/TalkBack labels, rotation/suspension, touch targets, and unavailable terminal behavior.

## Non-goals

No native enforcement, provider gateway, secret storage, ACP host lifecycle, arbitrary shell execution, history, context injection, Git/journal behavior, extension install, or UI before STOP.

## Handoff expectations

Deliver approved iterative desktop/mobile mockups, state/copy/accessibility matrix, renderer-safe model/components/tests, native contract notes, and unresolved questions. Concrete file paths remain likely.

## References

- `plans/ai/pending-acp_capability_enforcement-med-hard.md`
- `plans/ai/pending-acp_host_runtime-med-hard.md`
