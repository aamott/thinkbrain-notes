# Other Tasks — Completed Work

Standalone tasks (no epic) that have shipped. Open tasks live alongside this
file as `pending-*` / `wip-*` plans.

- `audit_journal_source` — audited `apps/desktop/src/journal/` for bloat; findings in `docs/reviews/2026-10-10/journal-source-audit-med-med.md`.
- `audit_settings_source` — audited `apps/desktop/src/settings/` for bloat; findings in `docs/reviews/2026-10-10/settings-source-audit-med-med.md`.
- `extension_listnotes_prefix` — `listNotes` pushes its folder prefix to the native layer so a query scans only that subtree.
- `sync_and_history_ui_redesign` — renamed "Decisions needed" to "Sync conflicts" with a header menu; moved document version history into the right inspector with a chunked-diff compare tab and "Restore this version".
- `bubble_menu_tap_toggle` — tapping an open bubble's trigger now closes its menu; dismiss layer no longer eats the retargeted click.
- `explorer_header_touch_targets` — explorer header buttons meet the 44px mobile touch-target minimum.
- `editor_display_settings_wiring` — `editor.fontSize`/`editor.lineWrapping` drive both editors reactively via a Compartment + `scrollSnapshot`; font size is absolute px (default 16), independent of `ui.scale`.
- `note_pinch_font_zoom` — two-finger pinch scaled editor font size via transform preview + anchored commit; shipped in 0.4.1, then removed entirely when the gesture proved non-functional on real WebViews. The settings it drove remain.
