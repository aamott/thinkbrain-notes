- name: Legacy `intent` field is dead metadata still set on every built-in command
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/commands/commandRegistry.ts
- lines: 24-34, 62, 92-210
- description: |
    `DesktopCommandIntent` and the optional `intent` field on `DesktopCommand` are
    described as "Retained metadata for integrations that still inspect the old
    command intent" (line 24, 61). However, execution now flows exclusively through
    `command.handler(context)` (DesktopShell.tsx:308-336), and a repo-wide grep for
    `.intent` outside `commandRegistry.ts` finds ZERO production consumers — the only
    reference is `commandRegistry.test.ts:32` asserting the value is still present.

    Every built-in command still sets `intent` (lines 92, 99, 112, 122, 132, 142,
    152, 162, 172, 182, 192, 201, 210), which is misleading: it implies the field is
    load-bearing when it is not. The acceptance criterion "Existing built-in
    features are migrated to use the formalized points" implies the old intent-based
    dispatch should be removed, not retained as unused baggage. Additionally,
    `DesktopCommandIntent` ends with `{ readonly type: string }` (line 34), a broad
    catch-all that defeats the discriminated-union narrowing for any new consumer.

    Recommended actions (pick one):
    - Remove `intent` and `DesktopCommandIntent` entirely, and drop the assertion at
      commandRegistry.test.ts:32. This is the cleanest migration.
    - If genuinely needed for a near-term integration, add a code comment naming the
      consumer and a test that exercises the consumer, and tighten the catch-all.
- verification: |
    `grep -rn '\.intent\b' apps/desktop/src` returns only commandRegistry.test.ts:32.
    DesktopShell.tsx:308-336 (`handlePaletteCommand`) calls `command.handler(context)`
    and never reads `command.intent`. commandPaletteModel.ts comment at line 101
    mentions "emitted command intent" but the model returns the full `DesktopCommand`
    item, not an intent.
