# Sync triggers besides the button

Carried from story 6b / parent story 6. A debounce and a frequency cap were
left until the round trip had been used by hand. Parent plan: on-idle
(debounced ~30s) + frequency cap (1/min default).

## Acceptance

- [x] Idle debounce and a frequency cap fire syncs without a click
- [x] "Sync now" still works, and two triggers cannot interleave on one vault

The sweeper fires a round trip after 30s still and at most once a minute.
"Bring these notes in step now" uses the same `sync` and the per-workspace
lane, so a click and an idle trigger queue rather than interleave. The footer
says "Bringing notes in step…" while a trip is in flight.

## Status

🟩 Done.
