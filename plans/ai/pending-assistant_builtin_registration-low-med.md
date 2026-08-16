# Assistant Built-in Registration

## Status

⬜ AI-owned registration seam; implementation belongs to the shared extension host/beta built-in integration story, not a second assistant panel path.

## Goal

Describe the handoff that registers ACP Agent Chat as the trusted `assistant-chat` built-in through canonical contribution/lifecycle APIs while AI owns behavior and the extension epic owns registration mechanics.

## Exact likely files

- `apps/desktop/src/panels/panelRegistry.tsx` — existing assistant contribution is the render target; do not duplicate it.
- `apps/desktop/src/panels/AssistantPanelSurface.tsx` — keep the lazy surface and unavailable fallback.
- `apps/desktop/src/agent/AssistantPanel.tsx` — behavior only; no extension host registration.
- `apps/desktop/src/agent/assistantBuiltin.ts` — AI-owned definition/factory contract if the extension host requires a definition module.
- `apps/desktop/src/native/ai.ts` — scoped provider/credential consumer handle only.
- `apps/desktop/src-tauri/src/ai/` — no separate registration implementation; native AI commands remain feature-owned.
- `apps/desktop/src/bootstrap/` (or the actual bootstrap module introduced by the extensions story) — beta built-in activation call, owned by extensions.
- Tests adjacent to the above plus the shared extension registration/lifecycle integration tests.

## Contract and ownership boundary

The built-in ID is `assistant-chat`; contribution IDs remain canonical and collision-checked. The built-in definition contributes the existing assistant panel, assistant commands (if any are approved), and a scoped provider/credential consumer capability. It receives an activation `ExtensionContext`/disposable scope and must unregister on deactivation. It may not own OS secret storage, raw secret reads in React, ACP process lifecycle, provider transport, chat history, or permissions.

The extension host calls the AI feature's factory/registration seam. The AI feature returns disposable registrations and consumes a narrow native secret-store interface. The beta built-in story owns bootstrap order, lifecycle cleanup, namespace collision tests, and integration with shared contribution registries. Do not create an extension bypass or a second `AssistantPanel` registry.

## Dependencies and order

1. Shared extension contribution/lifecycle/settings APIs and canonical namespace.
2. Native secret-store consumer boundary for the scoped credential capability.
3. Assistant panel/runtime and AI behavior stories.
4. Beta built-in bootstrap integration last; it must not block local feature unit tests.

## Tests

- Registration appears exactly once under `assistant-chat` and existing `assistant` panel remains the render target.
- Duplicate namespace fails loudly; activation failure disposes partial registrations; shutdown/deactivation removes only assistant registrations.
- Assert no secret value crosses extension/renderer boundary and provider/ACP/history behavior remains in owning stories.
- Desktop integration verifies built-in available; mobile verifies the same registration can report unavailable ACP/process capabilities without crashing.

## Acceptance criteria

- [ ] `assistant-chat` registers exactly once through the shared host and existing assistant panel remains the render target.
- [ ] Activation failure/deactivation/shutdown dispose only assistant registrations and never duplicate behavior or secret ownership.
- [ ] Mobile unsupported ACP/process capabilities are explicit and do not crash or invoke desktop-only code.

## Automated validation

Run built-in/extension-host integration tests for collision, activation failure, disposal, redaction, and mobile-unavailable mapping; run `pnpm lint`, `pnpm typecheck`, and `pnpm build`.

## Manual checks

Start/stop the desktop extension host, open/close assistant panel, deactivate/reactivate, and confirm no duplicate panel/command. Verify provider configuration still uses native credential presence only and that deactivation closes feature subscriptions without deleting history or secrets.

## Manual desktop/mobile checks

Desktop: repeat registration and cleanup against the approved panel/runtime. Mobile: verify the same built-in ID reports unavailable ACP/process capabilities without desktop-only calls.

## Handoff expectations

Deliver owner-approved registration matrix, bootstrap handoff, collision/disposal tests, secret-boundary proof, and unresolved product/runtime questions; concrete paths remain likely.

## Consent, local/cloud, and mobile constraints

Registration is not consent. Local model availability may be shown without cloud consent; remote model/context and ACP capabilities still require their independent decisions. On mobile, the same built-in ID and contribution registration are used; unsupported agent process/capabilities must render unavailable rather than trigger desktop-only code.

## Non-goals

No extension host implementation, provider gateway, OS secret storage, ACP lifecycle, permission UI, history, context injection, marketplace/install path, or modifications to extension/Git/journal plans.
