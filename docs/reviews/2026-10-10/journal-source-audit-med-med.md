# Journal source audit (med/med)

Scope: `apps/desktop/src/journal/` + `apps/desktop/src/extensions/builtins/journal.tsx`.
Task: `audit_journal_source` (done — see `plans/other_tasks/done-summary.md`). Audit only — no behavior changes.

## Summary

- `journal/`: **4,721 source lines** (28 files), **4,409 test lines** (18 files) — test:source ≈ **0.93**.
- `extensions/builtins/journal.tsx`: 421 source + 288 test. Combined surface ≈ 5,142 / 4,697.
- The task's sizes are stale: `JournalFieldDefinitionsControl.tsx` is **295** lines (not 499) — it was already split into `FieldDraftCard`/`FieldDefinitionsJson`/`fieldDraft`/`fieldKey` and needs no further split. `JournalPanel.tsx` is 492, just under the 500 preference.
- Largest single test cluster is the metadata stack: 1,286 test lines (MetadataWidget+Field+BottomSheet+AddFieldRow) over 883 source lines.

**Top 3 recommendations**
1. Replace `JournalPanel`'s hand-rolled delete dialog (`JournalPanel.tsx:456-489`) with the shell `ModalDialog` — it's an a11y regression (no portal, focus trap, Escape, or inert) as well as duplication (~-20 lines).
2. Extract the duplicated "list folder + map `JournalError` to status + cancelled-flag effect + reloadToken" into a shared `useJournalListing` hook used by `useJournalEntriesQuery` and `CalendarTabContainer` (~-25 lines, kills a drift pair).
3. Consolidate `JournalTrouble` copy: `JournalTroubleCode` (journalChrome.tsx:58) literally duplicates `JournalErrorCode` (journalService.ts:81), and the three title strings duplicate the service constants (journalService.ts:76-78). Alias the type, share the constants, and collapse the ~8 copy tests across three test files into one parametrized test (~-80 test lines).

## Findings

| # | Finding | Where | Est. saving | Risk |
|---|---------|-------|-------------|------|
| 1 | Hand-rolled delete modal instead of `ModalDialog` | JournalPanel.tsx:456-489 | ~20 src + a11y fix | Low |
| 2 | Duplicated listing-read machinery | useJournalEntriesQuery.ts:111-140 vs CalendarTabContainer.tsx:77-119 | ~25 | Low-med |
| 3 | Trouble code type + copy duplicated with service | journalChrome.tsx:58,82-98 vs journalService.ts:76-78,81 | ~7 + drift-proofing | Low |
| 4 | JournalPanel: extract entry-actions & windowing | JournalPanel.tsx (below) | 492 → ~330 | Med |
| 5 | Header prop list redeclares a subset of `JournalPanelProps` | JournalPanelHeader.tsx:13-43 | ~14 | Low |
| 6 | Test-only / file-local exports | journalIndex.ts:29, journalFilterStore.ts:20,39, fieldDraft.ts:14, misc type exports | ~15 + honest API | Low |
| 7 | JournalTrouble copy tested 3× in three files | JournalPanel.test.tsx:362-388, JournalPanelContainer.test.tsx:84-110, CalendarTabContainer.test.tsx:91-158 | ~80 test | Low |
| 8 | MetadataWidget.test re-tests MetadataField behavior | MetadataWidget.test.tsx:128-202 vs MetadataField.test.tsx:59-186 | ~60 test | Low |
| 9 | Validation-code→words logic duplicated | JournalFieldDefinitionsControl.tsx:35-46 vs AddFieldRow.tsx:53-62 | ~10 | Low |
| 10 | `onCreateFolder` is a second identical "new entry" action | JournalPanelContainer.tsx:295 vs 311; JournalPanel.tsx:337-340 | ~10 | Needs product call |
| 11 | Style consts live on `FieldDraftCard`, imported backwards | FieldDraftCard.tsx:12-17 ← FieldDefinitionsJson.tsx:4, control:8 | ~0, cohesion | Low |
| 12 | MetadataBottomSheet hand-rolls modal mechanics weaker than ModalDialog's stack | MetadataBottomSheet.tsx:55-73,78-150 | ~15 + correctness | Med-high |

## 1. Delete dialog re-implements the shell modal, worse

`JournalPanel.tsx:456-489` builds a fixed overlay + card inline: click-outside only, no portal, no `role="dialog"`/`aria-modal`, no Escape, no focus trap, no inert background, `z-60` by hand. `../shell/ModalDialog.tsx` already provides all of that (portal, scrim, modal stack, `useDismissable`). Replace with `<ModalDialog title="Delete this entry?" description={pendingDelete} onDismiss={...}>` + two buttons. Saves ~20 lines *and* fixes a real a11y gap. Low risk — behavior is a strict improvement.

## 2. Duplicated listing-read machinery

`useJournalEntriesQuery.ts:111-140` and `CalendarTabContainer.tsx:77-119` are the same shape: `useCallback` read that calls `service.listEntries()` and maps `JournalError → code`, a cancelled-flag `useEffect`, a `reloadToken` counter and `reload`. Extract `useJournalListing(service, deps)` returning `{ listing | entries, status/trouble, reload, retry }`; the calendar keeps only its `CalendarEntry` mapping. ~25 lines saved and the error→state mapping can't drift. Low-med risk (hook semantics need care with the `listKey` dep).

## 3. Trouble code + copy duplicated between service and chrome

- `journalService.ts:81` `JournalErrorCode = "no-workspace" | "invalid-root" | "unreadable"` === `journalChrome.tsx:58` `JournalTroubleCode`. Alias one to the other.
- `journalService.ts:76-78` (`NO_WORKSPACE` etc.) duplicate `journalChrome.tsx:82-98` titles verbatim. Export the constants from the service (or a shared copy module) and build `COPY` from them — the two strings already agree, and disagreeing would be a silent UX split.

## 4. JournalPanel split — yes, by responsibility not lines

492 lines mixes three concerns: (a) virtualization — focus/scroll/height measurement (`:131-266`, `useLayoutEffect`s, `move`); (b) entry actions — context menu, inline rename, delete confirm (`:137-142`, `:274-292`, `:436-489`, plus the rename props wired into `Row`); (c) state copy (`:313-410`). Extract (b) into `JournalEntryActions.tsx` (menu + confirm dialog + `useEntryActions` hook) and optionally (a) into `useJournalWindow.ts`; panel drops to ~330-380. Medium risk: windowing touches several refs — extract actions first. `JournalFieldDefinitionsControl` needs no split (295).

## 5. JournalPanelHeader prop redeclaration

`JournalPanelHeader.tsx:13-43` redeclares 14 props that are a verbatim subset of `JournalPanelProps`. `type JournalPanelHeaderProps = Pick<JournalPanelProps, "view" | "search" | …>` saves ~14 lines and removes a drift pair (a prop added to the panel but not redeclared compiles today only because the call site passes it explicitly).

## 6. Dead-ish / file-local exports (each grep-verified, tests included)

- `JOURNAL_SEARCH_LIMIT` (journalIndex.ts:29): used only by journalIndex.test.ts:33. Make module-private; the test should pin `limit: 200` anyway since 200 *is* the contract.
- `getJournalFilter` (journalFilterStore.ts:20): used only in JournalPanelContainer.test.tsx:308. Dead-ish — drop or inline `useJournalFilterStore.getState()` in the test.
- `resetJournalFilter` (journalFilterStore.ts:39): test-only seam, comment admits it. Legit pattern for a module-level store; keep but mark `@internal` — counts as test-only per the audit rule.
- `Kind` (fieldDraft.ts:14): no consumer outside the file — unexport.
- Internal-only type exports (`FieldDefinitionsResult`, `JournalTroubleProps`, `FieldAffordancesProps`, `MetadataFieldSize`): harmless; unexport for a smaller surface if touched anyway.

## 7. JournalTrouble copy tested three times

The same three trouble states are asserted at the DOM level in `JournalPanel.test.tsx:362-388`, `JournalPanelContainer.test.tsx:84-110`, and `CalendarTabContainer.test.tsx:91-158` (~8 tests). The copy lives once in `JournalTrouble` — pin it once in a `journalChrome.test.tsx` parametrized over the three codes, and keep at most one smoke test per container (that it wires `status` through). ~80 test lines saved.

## 8. MetadataWidget.test covers MetadataField's contract

`MetadataWidget.test.tsx:128-202` ("records a single-select choice", "clears … same option", "adds/removes multi-select", "records a number and a text", "clears … empty string") exercises `MetadataField` pill/input behavior that `MetadataField.test.tsx:59-186` already pins directly. The widget tests only need to prove `onSet` plumbing. Trim ~60 lines; keep one smoke per field kind at most.

## 9. Validation-code wording duplicated

`JournalFieldDefinitionsControl.tsx:35-46` (`explain`) maps `journal_field_reserved`/`journal_field_id_invalid`/`journal_field_options_missing` to prose; `AddFieldRow.tsx:53-62` re-encodes the first two inline. Share `explain` (e.g. in `fieldKey.ts` or a small `fieldProblem.ts`) — the two already say different words for the same code, which is the drift the shared helper exists to prevent.

## 10. `onCreateFolder` duplicates `onNewEntry`

`JournalPanelContainer.tsx:295` and `:311` both wire `run(() => service.createEntry())`. `JournalPanel.tsx:337-340` then renders "＋ New entry" and "Start journaling" side-by-side in the empty state — two buttons, identical effect (createNote already makes parent folders, journalService.ts:199-204). Either the copy was meant to differ (folder setup vs first entry) or it's leftover. Recommend dropping `onCreateFolder` and the second button — a product call since it changes the approved empty-state mockup.

## 11. Style constants exported from the wrong file

`LINK`/`BTN`/`PRIMARY` are defined in `FieldDraftCard.tsx:12-17` but consumed by the control and by `FieldDefinitionsJson.tsx:4` — a JSON textarea importing styles from a form card. Move to `journalChrome.tsx` beside `TOUCH`/`ACTION` (net 0 lines, correct dependency direction).

## 12. MetadataBottomSheet duplicates modal mechanics, weaker

`MetadataBottomSheet.tsx:55-73` hand-rolls what `ModalDialog` owns: `document.activeElement` capture + focus restore, `#root` inert toggle, portal, `useDismissable`. Its version doesn't participate in the modal stack — opened above another modal it would restore `inert` wrongly (the exact bug `modalStack` in ModalDialog.tsx:24-43 documents). The bottom-sheet frame/swipe/keyboard-inset are genuinely different, but the inert/focus portion should reuse the shared overlay stack (extract it, or the modal-stack helpers). Medium-high risk — phone-only path, manually verifiable, not worth doing blind.

## Non-findings (checked, fine)

- `journalService.ts` (269): the `writtenPaths`/`serialize` machinery earns its lines; its 6 "listing that has not caught up" tests cover real races.
- `journalRowUtils.ts` (16) could fold into `JournalRow.tsx` — cosmetic either way.
- `journalViewModel.ts:252-291` row-height block has exactly one consumer (JournalPanel) — could move, ~0 net lines, minor cohesion gain.
- `AddFieldRow`'s inline suggestion menu vs `../shell/Menu`: different interaction (combobox on a live input); not the same component.
- builtins/journal.tsx: `cachedDefinitions` (:111-119) vs `useParsedDefinitions` (:185-188) look duplicated but serve sync (`belongsHere`) vs reactive callers. Minor: `onDefineField`/`onAddOption` (:209-232) duplicate the parse→JSON.stringify→`settings.set` pattern — extract `writeDefinitions` (~-8).
- `journal/mobile-a11y-checklist.md` (120 lines) is documentation inside `src/` — consider moving to `docs/`.
