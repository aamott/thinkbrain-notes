- name: facetsAvailable hardcoded false — Filter button is a dead affordance
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/journal/JournalPanelContainer.tsx
- lines: 256, 248-465 (JournalPanel.tsx)
- description: |
    `JournalPanelContainer` passes `facetsAvailable={false}` unconditionally
    (line 256). The comment explains facets wait on the platform index, but
    the result is that `JournalPanel`'s "Filter" button (JournalPanel.tsx
    line 450) is always rendered with `disabled={!facetsAvailable}` — i.e.
    always disabled. The active-filter-count badge logic (lines 451-463) is
    likewise unreachable in practice because no caller ever sets
    `facetsAvailable=true` except tests.
    A permanently-disabled button with a count badge that can never appear is
    a dead affordance: it teaches the user there is a Filter feature that does
    not exist yet. Either wire it to the index readiness, or omit the button
    entirely (the panel already has a "Search unavailable" banner pattern for
    the same situation) until facets ship.
- verification: |
    grep `facetsAvailable` across the journal dir: only the container sets it
    (always `false`), the panel reads it, and two test references set `true`/
    `false` directly. No production path sets `true`.
- fix: |
    Either pass `indexAvailable` (or a facets-ready flag) through, or drop the
    Filter button + badge until the feature is reachable. If kept as a
    placeholder, prefer hiding over disabling per the panel's own D-pattern
    ("a button that does nothing is worse than no button", JournalPanel.tsx
    line 87).
