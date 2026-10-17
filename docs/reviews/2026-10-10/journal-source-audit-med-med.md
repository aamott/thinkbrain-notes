# Journal source audit (med/med)

Scope: `apps/desktop/src/journal/` + `apps/desktop/src/extensions/builtins/journal.tsx`.
Task: `audit_journal_source` (done — see `plans/other_tasks/done-summary.md`). Audit only — no behavior changes.

> Updated 2026-10-16: findings 1–3 shipped in the journal source cleanup
> (`9c85a181` — `ModalDialog` swap, shared `useJournalListing`, `JournalTroubleCode`/
> `JOURNAL_ERROR_TITLES` dedup) and were removed. Findings below are the original
> #4–12, renumbered 1–9.

## Summary

- `journal/`: **4,721 source lines** (28 files), **4,409 test lines** (18 files) — test:source ≈ **0.93**.
- `extensions/builtins/journal.tsx`: 421 source + 288 test. Combined surface ≈ 5,142 / 4,697.
- The task's sizes are stale: `JournalFieldDefinitionsControl.tsx` is **295** lines (not 499) — it was already split into `FieldDraftCard`/`FieldDefinitionsJson`/`fieldDraft`/`fieldKey` and needs no further split. `JournalPanel.tsx` is 492, just under the 500 preference.
- Largest single test cluster is the metadata stack: 1,286 test lines (MetadataWidget+Field+BottomSheet+AddFieldRow) over 883 source lines.

## Findings

| # | Finding | Where | Est. saving | Risk |
|---|---------|-------|-------------|------|
| 1 | JournalPanel: extract entry-actions & windowing | JournalPanel.tsx (below) | 492 → ~330 | Med |
| 2 | Header prop list redeclares a subset of `JournalPanelProps` | JournalPanelHeader.tsx:13-43 | ~14 | Low |
| 3 | Test-only / file-local exports | journalIndex.ts:29, journalFilterStore.ts:20,39, fieldDraft.ts:14, misc type exports | ~15 + honest API | Low |
| 4 | JournalTrouble copy tested 3× in three files | JournalPanel.test.tsx:362-388, JournalPanelContainer.test.tsx:84-110, CalendarTabContainer.test.tsx:91-158 | ~80 test | Low |
| 5 | MetadataWidget.test re-tests MetadataField behavior | MetadataWidget.test.tsx:128-202 vs MetadataField.test.tsx:59-186 | ~60 test | Low |
| 6 | Validation-code→words logic duplicated | JournalFieldDefinitionsControl.tsx:35-46 vs AddFieldRow.tsx:53-62 | ~10 | Low |
| 7 | `onCreateFolder` is a second identical "new entry" action | JournalPanelContainer.tsx:295 vs 311; JournalPanel.tsx:337-340 | ~10 | Needs product call |
| 8 | Style consts live on `FieldDraftCard`, imported backwards | FieldDraftCard.tsx:12-17 ← FieldDefinitionsJson.tsx:4, control:8 | ~0, cohesion | Low |
| 9 | MetadataBottomSheet hand-rolls modal mechanics weaker than ModalDialog's stack | MetadataBottomSheet.tsx:55-73,78-150 | ~15 + correctness | Med-high |

## 1. JournalPanel split — yes, by responsibility not lines

492 lines mixes three concerns: (a) virtualization — focus/scroll/height measurement (`:131-266`, `useLayoutEffect`s, `move`); (b) entry actions — context menu, inline rename, delete confirm (`:137-142`, `:274-292`, `:436-489`, plus the rename props wired into `Row`); (c) state copy (`:313-410`). Extract (b) into `JournalEntryActions.tsx` (menu + confirm dialog + `useEntryActions` hook) and optionally (a) into `useJournalWindow.ts`; panel drops to ~330-380. Medium risk: windowing touches several refs — extract actions first. `JournalFieldDefinitionsControl` needs no split (295).

## 2. JournalPanelHeader prop redeclaration

`JournalPanelHeader.tsx:13-43` redeclares 14 props that are a verbatim subset of `JournalPanelProps`. `type JournalPanelHeaderProps = Pick<JournalPanelProps, "view" | "search" | …>` saves ~14 lines and removes a drift pair (a prop added to the panel but not redeclared compiles today only because the call site passes it explicitly).

## 3. Dead-ish / file-local exports (each grep-verified, tests included)

- `JOURNAL_SEARCH_LIMIT` (journalIndex.ts:29): used only by journalIndex.test.ts:33. Make module-private; the test should pin `limit: 200` anyway since 200 *is* the contract.
- `getJournalFilter` (journalFilterStore.ts:20): used only in JournalPanelContainer.test.tsx:308. Dead-ish — drop or inline `useJournalFilterStore.getState()` in the test.
- `resetJournalFilter` (journalFilterStore.ts:39): test-only seam, comment admits it. Legit pattern for a module-level store; keep but mark `@internal` — counts as test-only per the audit rule.
- `Kind` (fieldDraft.ts:14): no consumer outside the file — unexport.
- Internal-only type exports (`FieldDefinitionsResult`, `JournalTroubleProps`, `FieldAffordancesProps`, `MetadataFieldSize`): harmless; unexport for a smaller surface if touched anyway.

## 4. JournalTrouble copy tested three times

The same three trouble states are asserted at the DOM level in `JournalPanel.test.tsx:362-388`, `JournalPanelContainer.test.tsx:84-110`, and `CalendarTabContainer.test.tsx:91-158` (~8 tests). The copy lives once in `JournalTrouble` — pin it once in a `journalChrome.test.tsx` parametrized over the three codes, and keep at most one smoke test per container (that it wires `status` through). ~80 test lines saved.

## 5. MetadataWidget.test covers MetadataField's contract

`MetadataWidget.test.tsx:128-202` ("records a single-select choice", "clears … same option", "adds/removes multi-select", "records a number and a text", "clears … empty string") exercises `MetadataField` pill/input behavior that `MetadataField.test.tsx:59-186` already pins directly. The widget tests only need to prove `onSet` plumbing. Trim ~60 lines; keep one smoke per field kind at most.

## 6. Validation-code wording duplicated

`JournalFieldDefinitionsControl.tsx:35-46` (`explain`) maps `journal_field_reserved`/`journal_field_id_invalid`/`journal_field_options_missing` to prose; `AddFieldRow.tsx:53-62` re-encodes the first two inline. Share `explain` (e.g. in `fieldKey.ts` or a small `fieldProblem.ts`) — the two already say different words for the same code, which is the drift the shared helper exists to prevent.

## 7. `onCreateFolder` duplicates `onNewEntry`

`JournalPanelContainer.tsx:295` and `:311` both wire `run(() => service.createEntry())`. `JournalPanel.tsx:337-340` then renders "＋ New entry" and "Start journaling" side-by-side in the empty state — two buttons, identical effect (createNote already makes parent folders, journalService.ts:199-204). Either the copy was meant to differ (folder setup vs first entry) or it's leftover. Recommend dropping `onCreateFolder` and the second button — a product call since it changes the approved empty-state mockup.

## 8. Style constants exported from the wrong file

`LINK`/`BTN`/`PRIMARY` are defined in `FieldDraftCard.tsx:12-17` but consumed by the control and by `FieldDefinitionsJson.tsx:4` — a JSON textarea importing styles from a form card. Move to `journalChrome.tsx` beside `TOUCH`/`ACTION` (net 0 lines, correct dependency direction).

## 9. MetadataBottomSheet duplicates modal mechanics, weaker

`MetadataBottomSheet.tsx:55-73` hand-rolls what `ModalDialog` owns: `document.activeElement` capture + focus restore, `#root` inert toggle, portal, `useDismissable`. Its version doesn't participate in the modal stack — opened above another modal it would restore `inert` wrongly (the exact bug `modalStack` in ModalDialog.tsx:24-43 documents). The bottom-sheet frame/swipe/keyboard-inset are genuinely different, but the inert/focus portion should reuse the shared overlay stack (extract it, or the modal-stack helpers). Medium-high risk — phone-only path, manually verifiable, not worth doing blind.

## Non-findings (checked, fine)

- `journalService.ts` (269): the `writtenPaths`/`serialize` machinery earns its lines; its 6 "listing that has not caught up" tests cover real races.
- `journalRowUtils.ts` (16) could fold into `JournalRow.tsx` — cosmetic either way.
- `journalViewModel.ts:252-291` row-height block has exactly one consumer (JournalPanel) — could move, ~0 net lines, minor cohesion gain.
- `AddFieldRow`'s inline suggestion menu vs `../shell/Menu`: different interaction (combobox on a live input); not the same component.
- builtins/journal.tsx: `cachedDefinitions` (:111-119) vs `useParsedDefinitions` (:185-188) look duplicated but serve sync (`belongsHere`) vs reactive callers. Minor: `onDefineField`/`onAddOption` (:209-232) duplicate the parse→JSON.stringify→`settings.set` pattern — extract `writeDefinitions` (~-8).
- `journal/mobile-a11y-checklist.md` (120 lines) is documentation inside `src/` — consider moving to `docs/`.
