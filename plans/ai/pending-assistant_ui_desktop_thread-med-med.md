# assistant-ui Desktop Thread

## Goal

Build a CSS-Module-themed assistant-ui chat thread for the right popout with
local history and clear provider/configuration states.

## Acceptance Criteria

- [ ] The assistant panel uses `AssistantRuntimeProvider` and assistant-ui
      thread/composer primitives; no bespoke parallel message store is created.
- [ ] UI matches `--tn-*` tokens and supports streaming, cancellation, retry,
      empty, loading, error, keyboard, focus, and narrow-panel states.
- [ ] A desktop `ThreadHistoryAdapter` persists AI-SDK-compatible messages and
      metadata in OS app-data, keyed by thread ID, and round-trips format data
      without putting history in the vault.
- [ ] Assistant Cloud is not configured; secrets and full note contents are
      absent from logs, error boundaries, and history metadata.
- [ ] Component/integration tests cover transcript restoration and stream UI
      transitions using the transport test double.

## References

- `plans/ui-shell/pending-right_popout_inspectors-med-med.md`
- `plans/ai.md`
- assistant-ui history docs: https://www.assistant-ui.com/docs/runtimes/ai-sdk/v7
