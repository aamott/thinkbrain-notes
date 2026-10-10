# Soft-Open (Preview) Tabs

**Status:** ⬜ pending · **Urgency:** med · **Difficulty:** med

Clicking a file always opens a new tab today. Standard behaviour is a
reused *preview* tab: each click replaces it until the user edits, pins, or
double-clicks — then it becomes permanent. On mobile the expectation is
stronger: tapping files should stay in one tab by default; a new tab is an
explicit action.

## Shape

- Tab gains a `preview` flag. File-open lands in the existing preview tab
  (replacing its resource) when one exists; otherwise opens one.
- Edit in the tab, pin action, or explicit "open in new tab" promotes it to
  permanent. Dirty preview tabs must never be silently replaced — prompt or
  promote instead.
- Mobile: same model — taps reuse the preview tab; the new-tab button is the
  explicit escape.
- Decide interplay with the tab switcher, Back/Forward history (a replaced
  preview probably rewrites the current history entry rather than pushing),
  and session restore.

Related: `new_tab_button` story for the explicit new-tab affordance.
