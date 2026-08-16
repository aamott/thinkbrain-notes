# Story: Popout Open Latency

## Problem

Opening any left popout takes noticeably longer than it should; the editor is fast, so this is
not the whole app. Reported from real use 2026-08-08, still present after a first fix.

## What is already known

- **Every popout re-rendered every kept-mounted panel.** `LeftPopout` built a fresh context
  object per render, and `explorer` and `source-control` are `keepMounted`, so opening any
  popout re-rendered the file tree and Git status too. Fixed 2026-08-08 (memoized context,
  per-panel `memo`). **Helped, did not solve it** — so at least one other cause remains.
- **Extension panels wait on activation.** A lazily-activated extension (the journal) mounts
  `LazyExtensionPanel`, shows "Starting extension…", awaits activation, and only then starts
  its own work. Three sequential async hops before content. By design (D65), but the design
  assumed activation is imperceptible.

## Goal

Find the remaining cost by measurement, not inspection, and make opening a popout feel
immediate.

## Approach

1. Measure first. React Profiler trace (or `performance.mark`) around an activity-bar click:
   which components render, how many times, and for how long. Do not optimise before this.
2. Check the obvious suspects the trace will confirm or clear: `WorkspaceExplorer` tree build,
   `gitService` status on mount, settings-store subscriptions, panel factories doing work
   during render.
3. Consider eager activation for **built-in** extensions, or activating on app idle rather
   than on first view, so `onView` never sits in front of a click. Weigh against D65.

## Acceptance criteria

- [ ] A recorded before/after measurement, not a subjective judgement.
- [ ] Opening a popout does no work proportional to workspace size on the click path.
- [ ] Lazy activation (D65) either stays and is imperceptible, or is changed by a recorded
      decision.
- [ ] No panel loses its state across a switch; `keepMounted` behaviour is unchanged.

## Non-goals

- No new caching layer, no virtualization work (owned by the journal panel story), no change
  to what a panel renders.

## Notes

Nothing here is user-visible behaviour, so no mockup gate applies.
