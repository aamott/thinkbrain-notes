- name: BottomPanel wraps a single provider in three layers (BottomPanelContent → TerminalPanel → Unavailable)
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/panels/BottomPanel.tsx
- lines: 24-42
- description: |
    The bottom panel has one provider (`terminal`) and one tab id. The render
    chain for its content is:

    ```tsx
    const bottomPanelProviders: Record<BottomPanelId, BottomPanelProvider> = {
      terminal: { id: "terminal", isAvailable: false, unavailableMessage: "…" }
    };

    function TerminalPanel({ provider }) {
      return <Unavailable ... description={provider.unavailableMessage} />;
    }

    function BottomPanelContent({ provider }) {
      return <TerminalPanel provider={provider} />;
    }
    ```

    `BottomPanelContent` is a one-line pass-through to `TerminalPanel`, which
    is itself a one-line wrapper around `Unavailable`. With only one provider
    and no dispatch logic, both wrappers add indirection without behavior.

    Inline `TerminalPanel`'s body into `BottomPanelContent` (or directly into
    the tabpanel render) and drop the separate `TerminalPanel` component. The
    `bottomPanelProviders` record and `bottomPanelItems` tuple can stay if the
    multi-tab surface is genuinely imminent, but the two-function chain can be
    flattened to a single `<Unavailable>` call today.

    Estimated savings: ~10 lines / ~80 tokens.
- verification: |
    `grep -n "BottomPanelContent\|TerminalPanel" BottomPanel.tsx` shows
    `BottomPanelContent` (line 40) only delegates to `TerminalPanel` (line 33),
    which only renders `<Unavailable>`. `BottomPanelId` is the union `"terminal"`
    (shellTypes.ts:49), so there is exactly one provider.
