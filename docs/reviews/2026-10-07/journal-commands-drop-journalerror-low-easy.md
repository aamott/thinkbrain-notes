# Journal palette commands swallow `JournalError` — no-workspace invocation is silent

- **Urgency:** low
- **Difficulty:** easy
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/extensions/builtins/journal.tsx`
- **Lines:** 333–353

## Description

The `new-entry` and `today` command handlers fire `void service.createEntry()`
and `void service.openToday()`. Both reject with a `JournalError` carrying
approved user-facing copy ("Open a folder to start journaling." /
"The journal folder setting isn't a valid path." / "Can't read the journal
folder.") when there is no workspace or a bad root. Because the promise is
discarded inside a synchronous handler, the rejection escapes the shell's
`runCommand` `.catch` (`useShellCommands.ts:119–123` only sees the handler's own
return) and becomes an unhandled rejection — console noise with zero user
feedback. The command appears to do nothing.

Every UI surface that calls the same service does handle it:
`useJournalEntriesQuery.ts:111` and `CalendarTabContainer.tsx:86–92` map the
error code to a rendered state. The palette path is the only fire-and-forget
caller.

## Recommendation

Attach a `.catch` that at minimum logs the message (project rule: fail loudly),
e.g.

```ts
handler: ({ closePalette }) => {
  service.createEntry().catch((error: unknown) => {
    console.error("[journal] new-entry failed.", error);
  });
  closePalette();
}
```

Better, once the left-panel reveal works (see the `open-calendar` finding):
reveal the journal panel on `JournalError` so its existing `no-workspace` /
`invalid-root` states show the approved copy. `availability` is a static string,
so the command cannot simply mark itself unavailable without an open workspace.

## Verification

With no workspace open, run "Open today's journal entry" from the palette:
nothing happens in the UI and an unhandled `JournalError("no-workspace")` lands
in the console. Compare with the journal panel, which renders the same
condition's copy via `useJournalEntriesQuery.ts:111–115`.
