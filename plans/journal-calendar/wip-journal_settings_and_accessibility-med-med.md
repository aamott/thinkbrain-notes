# Story: Journal Settings & Accessibility Contract

**Status:** 🟨 settings implemented (`journalSettings.ts` schema,
`JournalFieldDefinitionsControl.tsx`, `parseFieldDefinitions` diagnostics) and
registered by the built-in. Remaining: the extension settings UI (blocked on
`extension_settings` rendering), the D23 per-id overlay (values currently
resolve whole-setting, workspace over app), and the accessibility pass.

Part of [Journal & Calendar](journal-calendar). Decisions D1-D88 in
`assets/journal_discovery_and_wireframes`.

## Approved settings — D64/D49/D80

Registered under `extension-journal-calendar` via
`context.settings.registerSchema` (host prefixes the module id); `set`
stages until the user saves; values persist in OS app-data, never the vault.

| Setting | Type | Scope | Default |
|---|---|---|---|
| `root` | path | app + workspace | `journal` |
| `fieldDefinitions` | `journal-field-definitions` control (JSON string, D49) | app + workspace | `[]` |
| `calendarDefaultView` | `week`/`month` | workspace (D80) | `month` |
| `startOfWeek` | `system`/`monday`/`sunday` | app | `system` |

Never settings: templates (D21), nesting/filename pattern (D17),
timezone/day-start (D19), mood colors/icons (D4/D31).

## Key decisions

- D23/D45: workspace replaces the complete same-id global definition while
  untouched globals remain; removed values stay visible/filterable as
  `unconfigured`; notes are never rewritten (D33).
- D31: keyboard + screen-reader required; high contrast is theme-owned;
  `--tn-*` only; reduced-motion and the formal touch-target audit stay
  deferred.
- Settings are NOT assumed user-visible: `extension_settings` has not shipped
  the rendering layer — verify behavior programmatically until it does.

## Acceptance criteria

- [x] Four settings registered under `extension-journal-calendar` with the
      approved types/scopes; no template settings (D21/D64).
- [x] Field definitions limited to multi-select, single-select, number, text
      (D4); malformed entries produce diagnostics, never throw.
- [x] App/workspace values persist outside the vault under
      `extension-journal-calendar`; `context.settings.set` stages until Save.
- [x] Changing a setting never rewrites a note (D33); surgical single-key
      edits via `frontmatterEdit.ts` preserve unknown fields.
- [ ] Global and workspace definitions resolve by stable id: workspace
      replaces same-id definitions completely, untouched globals remain
      (D23/D45). Currently a whole-value workspace-over-app fallback — the
      per-id overlay is not implemented.
- [ ] Removed/narrowed values remain visible **and filterable** as
      `unconfigured` with a diagnostic (widget display shipped; filter path
      to verify).
- [ ] `root` validated; unsafe paths give actionable diagnostics (D7 —
      `invalid-root` exists; check the settings-side validation copy).
- [ ] All journal/calendar controls `--tn-*` only; no color-only meaning
      (D31/D4).
- [ ] Keyboard-operable controls (Tab/Shift-Tab, Enter/Space, Escape) and
      screen-reader labels/errors/live regions (D31).
- [ ] Settings sections render with staged save/reset once
      `extension_settings` ships the UI.
- [ ] Test sweep confirmed: schema/validation, scope isolation, same-id
      replacement, unconfigured values, staged save, keyboard semantics,
      accessible names.

## Handoff

`FieldDefinition` is `{ id, label, type, options? }`, `type` one of
`text`/`single-select`/`number`/`multi-select` (D49 — field name is `type`).
`mobile-a11y-checklist.md` covers the journal a11y matrix.
