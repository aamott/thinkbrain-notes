# Story: Settings source cleanup (from 2026-10-10 audit)

Scope: findings 1, 2, 3, and 5 of the settings-source audit. Other findings remain separate follow-ups.

## Acceptance

- [x] Duplicated precedence and document-chain tests consolidated; shared gateway setup extracted.
- [x] Pass-through module already absent; remaining export-write wrappers removed.
- [x] `settingsStore.ts` split into registry/hooks, public types, and store implementation (693 to 515 lines).

Validation: `pnpm qa` passes; focused tests, lint, and desktop typecheck pass after test-review fixes. Save/conflict/autosave and late-schema behavior remain unchanged.
