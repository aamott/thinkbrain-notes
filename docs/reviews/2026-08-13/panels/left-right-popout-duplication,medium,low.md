- name: LeftPopout and RightPopout are near-identical and should share a Popout component
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/panels/LeftPopout.tsx
- lines: 1-78
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/panels/RightPopout.tsx
- lines: 1-77
- description: |
    The two popouts have the same structure with cosmetic side-specific
    differences:

    Shared structure (identical logic):
    - `useMemo` over a side-specific context object
    - `use{Left,Right}PanelContributions()` hook call
    - `getDesktopPanelOrUndefined(panel)` lookup
    - Unregistered-panel fallback `<aside>` with `<Unavailable>`
    - Main `<aside>` with `<PanelTitle>` + `.map` over contributions →
      `<MountedPanel>` with the same `isActive`/`keepMounted`/`isAvailable`
      gating

    Side-specific differences (only these vary):
    - `border-r` vs `border-l`
    - `left-[var(--tn-size-activitybar-width)]` vs `right-0`
    - `--tn-shell-left-width` vs `--tn-shell-right-width`
    - `LeftPanelContext` vs `RightPanelContext` (and the context fields)
    - `useLeftPanelContributions` vs `useRightPanelContributions`

    Extracting a generic `Popout<Ctx extends LeftPanelContext | RightPanelContext>`
    that takes `side`, `panel`, `context`, `useContributions`, and the
    side-specific className fragments would remove ~40 duplicated lines and
    eliminate the shadow/overflow drift documented in the companion finding
    `popout-shadow-overflow-inconsistency`. The existing `MountedPanel`
    component already accepts a generic context type, so the popout can pass
    `Ctx` through without casts.

    Estimated savings: ~40 lines / ~350 tokens across the two files, plus a
    single place to maintain the responsive className set.
- verification: |
    Read both files side by side; the only non-cosmetic differences are the
    context type, the contributions hook, and three className fragments. The
    `.map` body, the fallback branch, and the `PanelTitle` placement are
    character-for-character identical apart from the side-specific classes.
