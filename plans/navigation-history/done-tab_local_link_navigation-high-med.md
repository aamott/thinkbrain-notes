# Tab-Local Link Navigation

Correct the global tab-activation model from `location_centric_history`.
Links replace the current tab's document. Back/Forward walks that logical
tab's locations; switching tabs is not a new visit. Heading links are deferred.

Implemented and verified with permanent-tab, already-open-target, independent
trail, save-failure, revealed-editing, and desktop/phone browser regressions.

## Implementation Boundary

- Reuse the existing bounded visit storage and position restoration. Tag
  document views with a stable `trailId`; retain each open tab's selected
  visit id. Do not add a second timeline, provider, or persistence layer.
- New tabs start independent trails. Replacement keeps the logical trail and
  strip position. Activation restores that tab's selected visit without
  appending; Back/Forward and forward truncation are restricted to its trail.
- Keep existing document/editor view identities for cache and loader behavior.
  If a link target is already visible in another tab, retain that tab and
  give the current trail its own view identity rather than switching to it.
- Save dirty source documents before replacing them; failed saves leave the
  user in place. Never close another tab or discard edits to satisfy navigation.
- Closing a tab drops its whole trail. Renames follow actual resources, not
  assumptions that a view id is always the file path.
- Phone keeps Home and overlay behavior. Rebase its browser route segment to
  the selected tab's trail when manually switching logical tabs, preserving
  that trail's selected visit and Forward history.
- Concealed links intercept caret placement before mouse selection changes
  their DOM. Revealed links edit. Follow only a completed primary activation;
  canceled gestures, drags, and touch scrolling do not navigate.

## Acceptance Criteria

- Permanent tab A -> link B -> Back returns A in the same strip slot/count.
- Open another tab C, switch between tabs, and verify Back never visits C from
  A/B's trail; each tab retains its own Back/Forward position.
- A link to an already-open file stays in the current tab without closing or
  switching the other one. Dirty-save failure leaves both tabs untouched.
- Concealed mouse/touch links navigate; keyboard-revealed links remain editable.
- Focused regressions, full browser tests, and `pnpm qa` pass. Prefer removing
  superseded code and tests to adding compatibility scaffolding.
