# Navigation History

Back/Forward should navigate places, including positions within one note.
Each logical tab owns its navigation trail; activating another tab does not
create a visit or become a Back destination.

## Design

Reuse identified location visits, scoped to the current logical tab. Keep one
source of truth rather than compatibility logs or parallel position stores.

Capture position when leaving; restore position without restoring old text
or undo state. Closing a tab scrubs its visits, whereas navigating through a
reused preview preserves the previous destination. Phone adds Files as Home
and its other destinations around the same document visits.

The current tab-ownership contract and acceptance tests are specified in
`tab_local_link_navigation`; it supersedes the original global-activation
choice in `location_centric_history`. Fragment links and exact search-hit
jumps remain separate work.

## Stories

`location_centric_history` supplies position capture and outline jumps.
`tab_local_link_navigation` corrects tab ownership and default link placement.
`heading_fragment_navigation` covers same-note links;
`cross_note_heading_navigation` extends them to other notes.
`search_hit_navigation` remains separate.
