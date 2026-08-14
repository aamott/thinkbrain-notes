- name: `SearchPanel.tsx` hand-rolls a trailing debounce instead of using `lib/debounce.ts`
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/search/SearchPanel.tsx
- lines: 39-94
- description: |
    `SearchPanel.tsx` reimplements a trailing debounce inline:
      - `debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)` (line 40)
      - clear-on-change at the top of the effect (47-50)
      - `setTimeout(async () => {...}, delay)` with `delay = trimmed === "" ? 0 : SEARCH_DEBOUNCE_MS` (60-86)
      - clear-on-unmount cleanup (88-93)

    `lib/debounce.ts` already provides `createDebounced<T>` (lines 29-53) — a trailing debounce with `cancel()`, documented as the shared replacement for exactly these hand-rolled timers (its header comment, lines 1-12, lists "rapid settings edits saving once" and "a run of tab opens" as the cases it consolidates).

    The panel's debounce is *almost* a plain trailing debounce, with two extra responsibilities:
      1. A `requestIdRef` (line 41) for stale-result suppression — `if (requestId !== requestIdRef.current) return;` checks at 62, 75, 78, 82.
      2. An empty-query short-circuit that clears results synchronously (64-69) with `delay = 0`.

    The stale-result guard is orthogonal to debouncing and would stay as a `useRef` either way. The empty-query `delay = 0` is the one behavior `createDebounced` does not provide (it always waits `delayMs`), but that can be handled by an early-return before scheduling, which the panel already does in spirit.

    This is a real duplication (the same timer-clear/schedule/cancel pattern exists in `lib/debounce.ts` and is used elsewhere), but the integration is not a clean drop-in because of the `requestId` guard and the empty-query branch. Worth consolidating only if `createDebounced` grows a "leading-edge / zero-delay on first call" option or the panel moves to a reducer (see `search-panel-model-dead-reducer` finding) where the debounce wraps the dispatch. Flagging as a compaction opportunity, not a bug.
- verification: |
    grep `debounceRef|requestIdRef` → only in SearchPanel.tsx (16 matches).
    `lib/debounce.ts` exports `createDebounced` and its header explicitly lists the cases it was made to replace.
    grep `createDebounced` shows other consumers; SearchPanel.tsx is not among them.
- savings: ~10-12 lines if the panel adopts `createDebounced` and keeps the `requestId` guard separately; main value is removing one more hand-rolled timer.
