# Review: 2026-10-05 — phone floating bubbles (`b641632..9cba5f7`)

Scope: the bubbles/hub-removal rework (76 files) plus the surrounding
`shell/phone` architecture. Eight parallel read-only reviewers across two
batches: shell wiring, extracted hooks, overlays/menus, ui components,
settings/panels, tests/e2e, high-level architecture, and leftover detection.
Plus a separate security pass.

**Result:** no critical/high findings. The rework is structurally sound —
z-ordering, overlay ownership, effect semantics and the pure models all check
out; the deletion was complete.

## Fixed in the same change set (not listed as findings)

- `useKeyboardInset` reads ~0 under Android `adjustResize` → reworked to
  focus-based detection (`useSoftKeyboardOpen`).
- Bubbles stayed mounted/focusable under the `aria-modal` bottom sheet.
- Pointer-events gap between bubbles swallowed content taps.
- Stale route/tab read for one commit (`viewingNote`, breadcrumbs).
- Closing the background tab while on Files pushed a tab route.
- `NewNoteMenu` missing a max-height cap; menu dismiss layer under the scrim.
- Duplicated menu-shell code → `BubbleMenuShell`; menuKeyboard consolidation;
  `CountBadge` extraction; `isNoteTab` moved to `tabModel`.
- Test hygiene: silent no-op helpers, order-dependent selectors, drawer-close
  test hitting a covered button, badge-wiring coverage.

## Deferred findings

| Finding | Urgency | Difficulty |
|---|---|---|
| [Badge advertises an unreachable notification](badge-unreachable-notification-med-med.md) | medium | medium |
| [Inspector falls back to desktop `rightPanel` state](inspector-rightpanel-shadow-state-low-easy.md) | low | easy |
| [`openOverlay`/`showOverlay` API split is subtle](overlay-api-split-low-easy.md) | low | easy |
| [`new-note` commandId is special-cased twice](new-note-special-casing-low-trivial.md) | low | trivial |

The availability-triplication point is folded into
`plans/ui-shell/pending-contextual_action_items-med-hard.md` rather than a
separate finding — that story exists to unify it.

## Disposition (post-triage)

- **Fixed:** inspector right-panel shadow state (a shell-local last-panel ref
  now) and the `openOverlay`/`showOverlay` split (renamed `pushOverlay`, the
  push-vs-replace semantic now in the name). The `new-note` special-casing was
  fixed earlier in `fix/bubbles-after-keyboard`.
- **Dropped:** the badge finding is one bullet of `plans/ui-shell/
  pending-contextual_action_items-med-hard.md`, which owns the fix.
