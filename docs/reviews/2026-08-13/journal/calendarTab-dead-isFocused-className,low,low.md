- name: Dead conditional `isFocused ? "" : ""` in DayCell className
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/journal/CalendarTab.tsx
- lines: 96-101
- description: |
    The `className` array on the day cell includes:
      `isFocused ? "" : ""`
    Both branches yield the empty string, so the conditional contributes
    nothing. `isFocused` is already consumed by `tabIndex={isFocused ? 0 : -1}`
    on the same element, so the className ternary is pure dead code — likely
    a leftover from a styling pass that was reverted.
- verification: |
    Read of lines 96-101 confirms both arms are `""`. grep of `isFocused` in
    the file shows it is still used for `tabIndex`, so removing the className
    ternary loses nothing.
- fix: |
    Delete the `isFocused ? "" : ""` line from the className array. ~1 line
    saved and one fewer source of confusion for future readers.
