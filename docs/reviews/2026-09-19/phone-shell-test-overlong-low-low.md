# PhoneShell test file exceeds the project hard limit

- **Difficulty:** low
- **Urgency:** low
- **File:** `apps/desktop/src/shell/phone/PhoneShell.test.tsx`
- **Lines:** 1-1063

## Description

The test file now exceeds the repository's 800-line hard limit and mixes hub/drawer behavior, content navigation, autosave, and menu/inspector flows. This makes failures harder to localize and future additions risk further growth.

## Recommendation

Split the suite by product concern and centralize its shared shell render harness once a safe Vitest mock boundary is chosen. Avoid duplicating the current 180-line setup just to reduce individual file length.

## Verification

The current file has 1,063 lines. Repository guidance says files must never exceed 800 lines.
