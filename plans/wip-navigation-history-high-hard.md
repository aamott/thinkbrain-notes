# Navigation History

Back/Forward should navigate places, including positions within one note.
This remains one global timeline across tab activations, not independent
browser-style histories inside each tab.

## Design

Extend the existing entries/cursor model with identified location visits.
Two stacks do not remove close/rename/reset bookkeeping, and per-tab trails
do not directly serve the global navigation controls. Keep one source of
truth rather than compatibility logs or parallel position stores.

Capture position when leaving; restore position without restoring old text
or undo state. Closing a tab scrubs its visits, whereas navigating through a
reused preview preserves the previous destination. Phone adds Files as Home
and its other destinations around the same document visits.

The architecture, boundaries, scope, and acceptance tests are specified in
`location_centric_history`. Include outline navigation now; defer fragment
links and exact search-hit jumps rather than expanding scope implicitly.

## Stories

`location_centric_history` implements the shared timeline and outline jumps.
`heading_fragment_navigation` and `search_hit_navigation` extend the same
navigation boundary to the deferred entry points.
