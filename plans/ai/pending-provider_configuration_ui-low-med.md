# AI Provider Configuration UI and Metadata

## Status

⬜ Focused configuration child. Native model transport remains owned by the gateway child.

## Goal

Expose approved non-secret provider/model metadata and settings with explicit validation and secure-store presence states; never render or persist credentials.

## Discovery questions and STOP gate

- Which local runtime and remote providers/endpoints are supported?
- Is a connectivity probe optional/required, and does model switching affect the next turn or whole thread?
- What copy/layout is approved for unavailable OS secret store, remote consent, errors, desktop narrow widths, and mobile?

**STOP gate:** Do not create settings mockups, components, or provider integration until product answers and iterative desktop/mobile mockup approvals are recorded.

## Dependencies

- AI contracts/consent, native secret-store consumer boundary, existing modular settings registry.
- Existing assistant panel/settings shell; no gateway transport or ACP lifecycle.

## Likely files

- `apps/desktop/src/agent/providerConfiguration.ts` and tests (likely).
- `apps/desktop/src/settings/settingsStore.ts`, `SettingsContent.tsx`, existing controls only after approval.
- `apps/desktop/src/native/ai.ts` for redacted metadata/presence adapters; `packages/core/src/ai/contracts.ts` consumed only.

## Small task sequence

1. Record provider allowlist, fields, validation, state/copy, and desktop/mobile mockups.
2. Map non-secret config and credential presence to typed view models.
3. Implement approved controls and staged save/reset behavior after STOP.
4. Test validation, unavailable/error states, redaction, accessibility, and responsive layout.

## Acceptance criteria

- [ ] Only approved provider metadata and non-secret fields are rendered/persisted.
- [ ] Credential values never enter React, JSON settings, events, logs, or history; only presence/opaque references are exposed.
- [ ] Validation, dirty/save/reset, remote-consent status, and OS-store-unavailable states match approved copy.
- [ ] Renderer styling uses co-located CSS Modules with shared `--tn-*` tokens; no Tailwind utility classes or inline styles.
- [ ] Desktop/mobile keyboard, focus, screen-reader, narrow layout, and suspension behavior are tested.

## Automated validation

Run provider/config component and adapter tests, `pnpm lint`, `pnpm typecheck`, and `pnpm build`.

## Manual desktop/mobile checks

Desktop: configure/edit/reset approved local and remote metadata, verify no connectivity without consent, inspect storage/events for secrets, and test unavailable store. Mobile: test touch/keyboard/rotation/suspension and explicit unsupported states.

## Non-goals

No Rust model transport, provider SDK, secret-store implementation, ACP lifecycle/permissions, history, context, semantic search, or UI before STOP.

## Handoff expectations

Deliver approved iterative desktop/mobile mockups, field/provider matrix, view models/components/tests, persistence/redaction report, and unresolved decisions. Concrete paths remain likely.

## References

- `plans/ai/pending-ai_contracts_and_consent-low-hard.md`
- `plans/ai/pending-native_secret_store_consumer_boundary-med-hard.md`
