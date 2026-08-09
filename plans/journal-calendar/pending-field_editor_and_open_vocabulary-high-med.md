# Story: Field Editor and Open Vocabulary

**Mockup APPROVED 2026-08-08** — `assets/journal-field-editor-mockup.html`, closing D82.
**Status:** 🟩 complete 2026-08-08 — editor, self-healing values and `＋ Add` all shipped.

## Epic

Part of [Journal & Calendar](../pending-journal-calendar-high-hard.md). Extends
`pending-journal_settings_and_accessibility-med-med.md`, which owns the settings themselves.

## Why

The shipped `journal-field-definitions` control is a JSON textarea: setting up a mood field
means typing a correctly quoted array, or being refused without a location for the error. D49
fixed how field definitions are **stored**, not how they are **edited** — the custom control is
the seam that lets the editing surface be a form. Storage does not change here.

## Decisions this story implements

- **D82 (approved 2026-08-08).** The control is a list of fields plus an add/edit card. Kinds
  are named in plain words — *Pick one from a list*, *Pick several from a list*, *A number*,
  *A few words* — each shown with an example. The frontmatter key is derived from the name and
  displayed as small print with a `Change` override. No starter presets: examples beside a kind
  are a hint, a one-tap preset would be a vocabulary we shipped, which D4 forbids. `Edit as
  JSON` stays as an escape hatch.
- **D83 (approved 2026-08-08).** Values self-heal. A select value that is not among a field's
  configured options is preserved, and is offered as a **selected choice on that note only** —
  never written back into the definitions. This is what makes editing keys and options safe:
  removing a choice, or re-keying a field, can no longer strand what a note already says.
- **D84.** The metadata editor offers `＋ Add` to record a value that is not on the list. It
  applies **to that note only** and does not change the field's options. Writing a journal
  entry is not the moment to rewrite settings, and D83 means nothing is lost by not promoting
  it: the value stays in the note and its choice reappears whenever the note is opened. If a
  value becomes a habit, D82's editor makes adding it a ten-second job.

## Scope

- Rewrite `JournalFieldDefinitionsControl` per the approved mockup; keep the JSON escape hatch.
- Key derivation from the label, with D49's format rule and D48's reserved keys enforced in the
  form rather than reported after the fact.
- Self-healing select values (D83) in the metadata editor, at both densities.
- `＋ Add` in the metadata editor (D84).

Non-goals: no change to the stored shape (D49), no new setting (D64's four stand), no presets,
no facet or index work (D41), no repair of anything already written (D50).

## Acceptance criteria

- [x] A field can be added, edited, reordered by position in the list, and removed without typing JSON.
- [x] Kind names and examples match D82; `single-select` and friends appear nowhere on screen.
- [x] The key is derived from the name, shown as small print, and overridable; reserved (D48) and malformed (D49) keys are refused in the form with copy that says what to do.
- [x] Removing a field confirms, and says that values already written stay in the notes (D50).
- [x] Re-keying a field warns that notes using the old key stop being linked; renaming the label does not warn, because it is safe.
- [x] `Edit as JSON` still edits the same setting and still refuses to save unparseable input.
- [x] A select value absent from the options renders as a selected choice on that note (D83), marked as not one of the configured choices.
- [x] `＋ Add` records a value on the note without touching the field's options (D84).
- [x] The written JSON is byte-comparable with what the JSON control produces today.

## Validation

`pnpm lint`, `pnpm typecheck`, `pnpm test`. Desktop: add a field from empty, record it on an
entry, remove the field, and confirm the note still shows the value.
