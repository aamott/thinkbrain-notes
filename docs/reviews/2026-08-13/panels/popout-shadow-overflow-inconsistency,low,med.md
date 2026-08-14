- name: LeftPopout/RightPopout unavailable branch diverges from available branch in shadow and overflow
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/panels/LeftPopout.tsx
- lines: 45, 58 (LeftPopout); 44, 57 (RightPopout)
- description: |
    Both popouts render the same dock `<aside>` in two branches — an
    "unregistered panel" fallback and the normal panel render — but the
    responsive classes differ:

    LeftPopout unavailable (line 45):
    `max-[760px]:overflow-visible max-[760px]:shadow-panel`
    LeftPopout available (line 58):
    `max-[760px]:shadow-lg`  (no `overflow-visible`)

    RightPopout has the same split (lines 44 vs 57). So when the active panel id
    is unregistered, the mobile overlay gets `overflow-visible` + `shadow-panel`;
    when it is registered, the same dock gets `shadow-lg` and clips overflow.
    The dock's chrome should look identical whether the selected panel is
    registered or not — the only thing that should change is the body content.

    This also means the two branches must be kept in sync by hand for every
    future className change, which is a maintenance hazard.
- verification: |
    `grep -n "shadow-panel\|shadow-lg" apps/desktop/src/panels/{Left,Right}Popout.tsx`
    confirms `shadow-panel` + `overflow-visible` appear only in the unavailable
    branch of each file, while `shadow-lg` appears only in the available branch.
