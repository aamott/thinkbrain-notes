# Story: Journal Discovery, Moodboards & Wireframes

**Status:** complete (discovery approved 2026-08-07) · **Urgency:** low · **Difficulty:** med

## Epic

Part of [Journal & Calendar](../pending-journal-calendar-high-hard.md). This is the discovery gate; it must precede irreversible data and UI work.

## Questions first

- What job should the first 30 seconds of journaling accomplish?
- Is the calendar primarily navigation, reflection, metadata filtering, or all three?
- Which journal entry states need distinct affordances (missing, empty, malformed, read-only, unsaved)?
- Which moods, activities, date ranges, and template controls are necessary for the first usable slice?
- Should desktop show two activity-bar entries, and what is the smallest useful mobile navigation model?
- What does the user need to approve at each mockup checkpoint, and who may reject or revise it?

**STOP gate — SATISFIED 2026-08-07.** The questions above are answered in the decision
log below (D1-D40) and all three discovery artifacts are approved. Downstream stories
may now proceed **within** those decisions.

The gate remains closed for anything the log records as open. Each downstream story
carries its own STOP gate for its own undecided items, and no implementation story may
silently settle one. A superseding decision is recorded as a new D-number, never by
editing an earlier one.

## Goal

Produce a decision record and low-fidelity moodboard/wireframe set that separates confirmed requirements from open questions. Explore at least two journal/calendar information architectures without presenting either as final.

## Likely files

- `plans/journal-calendar/pending-journal_discovery_and_wireframes-low-med.md` (this decision log, updated with answers and approvals).
- `plans/journal-calendar/assets/journal-calendar-moodboard.md` (written; approved D35).
- `plans/journal-calendar/assets/journal-calendar-wireframes.md` (written; IA and mobile
  alternatives, state coverage, focus order; approved D37/D39/D40).
- `plans/technical-decisions.md` (do not edit in this story; propose cross-cutting decisions there only if separately approved).

## Dependencies

- `plans/app-vision.md`, `user-noted-todo.md`, mobile/UI-shell plans, and the beta built-in integration story read before discovery.
- No code dependency. Discovery output blocks data-model and UI stories.

## Decision log

Answers recorded from the product owner. Each entry is a confirmed decision unless
marked provisional. Nothing here authorizes a mockup, schema, or implementation;
the STOP gate stays closed until the remaining batches are answered and a first
wireframe is explicitly approved.

### Batch 1 — recorded 2026-08-05

**D1. The first 30 seconds is ordinary daily journaling, plus lightweight
day-level metadata capture.**
There is no special "quick capture" mode and no guided reflection prompt in the
first slice. The user opens today's entry and writes. Alongside the prose, the
entry may record day-level metadata such as activity/workout level and mood.

**D2. A journal entry is an ordinary Markdown note, not a special file type.**
The journal feature is a way to organize and read a specific folder of notes —
not a new format, not a new storage path, not a database-backed record. Every
constraint in `plans/app-vision.md` and `plans/technical-decisions.md` about
Markdown-as-source-of-truth applies unchanged.

**D3. Metadata lives at the top of the file and must be human-legible in a plain
text viewer.**
Metadata is stored at the head of the note so it can be read without parsing the
whole file — this matters for both journal fields and general note metadata such
as tags. A person opening the raw file in any text editor should be able to
understand what the values mean (for example, that a field records that day's
activity level) without consulting the app. This constrains the eventual
frontmatter contract in
`pending-journal_data_model_frontmatter-med-hard.md`: prefer self-describing keys
and plainly readable values over codes or app-internal identifiers.

**D4. Daily metadata fields are user-defined in the extension's settings, not a
fixed vocabulary.**
The app does not ship a fixed mood scale or activity taxonomy. The user
configures which daily fields exist. Supported input types for the first slice:

| Input type | Notes |
|---|---|
| multi-select | multiple values from a user-defined list |
| single-select | one value from a user-defined list |
| number | numeric value (for example a workout or activity level) |
| text | free-form string |

Mood and workout/activity level are examples of user-configured fields, not
built-in special cases. This supersedes any downstream assumption that the app
defines the mood or activity vocabulary.

**D5. The calendar serves navigation, reflection, and metadata filtering in
roughly equal measure.**
No single purpose dominates the first release. The calendar must support jumping
to a date, seeing patterns over a span of time, and filtering days by the
user-defined metadata from D4. Because the metadata vocabulary is user-defined,
the calendar cannot hard-code a mood colour scale or activity iconography.

**D6. Journal and calendar are separate activity-bar entries on desktop.**
Two distinct activity-bar buttons rather than one panel with switchable views or
a calendar nested inside the journal panel. Registration still goes through the
existing panel registry and `desktopExtensionHost`, per the epic's boundaries.
Mobile navigation is not settled by this decision and remains open.

**D7. Storage layout: a configurable journal folder holding date-named Markdown
files.**
The journal extension creates a journal folder — named `journal` by default,
changeable in the extension's settings — and writes Markdown files named by date
into it. Nesting is bounded: at the flattest, all files sit directly in the
journal folder; at the deepest, `year/month/day`. Layouts deeper than
year/month/day are out of scope. The default nesting and filename pattern are
settled in D17.

### Batch 2 — recorded 2026-08-05

**D8. Multiple entries per day are allowed; metadata is stored per file.**
The user may write several entries in one day, so each file carries its own
metadata block. There is no day-level metadata record separate from the files.

*Provisional:* where the calendar needs a single value for a day (for example a
mood swatch), the last entry of that day wins. This is a placeholder to unblock
discovery, not a settled rule — the real per-day aggregation policy is deferred
to `pending-calendar_data_model-med-med.md` and must be revisited there.

**D9. The journal activity-bar button opens the left popout containing a journal
menu; entries open in the main editor.**
Clicking the journal entry in the activity bar opens the left popout. The popout
has two regions:

- **Top:** menu items / actions.
- **Body:** a browser of entries. Default presentation is a **list grouped by
  week**, each row showing the date with the entry's **first line** rendered
  underneath it.

Creating a new entry or opening a past one opens that file in the **main editor
area** as a normal editor tab with a pre-named file. The popout is a navigator,
not a writing surface.

*Resolved in Batch 3 (D15):* the popout body is a grouped list, not a calendar.

**D10. Required controls in the journal popout.**

| Control | Behavior |
|---|---|
| Open calendar | Opens a calendar view in a tab |
| Filter by metadata | Filter entries by the user-defined fields from D4; filter options are **automatically populated** from values actually present in entries |
| Search entries | Full-text search across entries; see D16 |
| Group by | `none`, `day`, `week`, `month`, `year` — default `week` per D9 |

Ordering is always chronological and is not user-configurable; no sort control is
offered.

**D11. Day metadata is edited through a form widget above the editor body.**
The user fills a form rendered above the Markdown body rather than hand-writing
frontmatter. The form writes the metadata block described in D3, which must
remain legible as plain text. Behavior for notes with absent or malformed
metadata, and whether the widget appears outside the journal folder, is open.

**D12. Mobile: the left popout renders full screen.**
On phone widths the journal popout takes the whole screen rather than sitting
beside the editor. Both desktop and mobile layouts are in scope for the wireframe
set; mobile is not deferred to a later story.

**D13. Scale target: thousands of entries.**
Every list, group-by, filter, search, and calendar interaction must stay usable
at that volume. This has architectural consequences flagged below.

### Analyst notes — gaps and risks raised by Batch 2

Recorded so downstream authors do not rediscover them. None of these are
decisions.

1. **Surface contradiction.** D6 puts journal and calendar on separate
   activity-bar entries; D10 also opens a calendar in a tab. Whether the calendar
   exists as an activity-bar panel, a tab, or both is unresolved (Batch 3).
2. **Index dependency.** Auto-populated filter values, search, and group-by over
   thousands of entries cannot be served by reading files on demand. This implies
   a dependency on the indexing/search epic's SQLite FTS5 cache, which per
   `plans/technical-decisions.md` is a disposable, rebuildable cache and never
   the source of truth. The journal epic currently declares no such dependency —
   the epic's dependency list needs updating once confirmed.
3. **List virtualization.** Group-by `none` over thousands of entries produces an
   unbounded list; the popout body needs windowing/virtualization. Worth stating
   explicitly in the panel story so it is not discovered during implementation.
4. **First-line previews at scale.** Rendering each row's first line requires
   reading into every file. This is the same index concern as (2).
5. **Same-day file naming.** With multiple entries per day (D8), the naming rule
   for the second and later entries of a day is undefined, as is whether "new
   entry for today" creates another file or reopens the existing one.
6. **Field-definition drift.** If the user renames a field or removes a
   select option in settings, existing files keep the old keys and values. The
   read/display behavior for orphaned metadata is undefined.
7. **Widget scope.** Whether the D11 form appears for every note in the journal
   folder, only for app-created entries, or for any note carrying the fields.
8. **Malformed metadata.** What the form widget shows when frontmatter is invalid
   YAML, and whether it may rewrite the file to repair it — noting the frontmatter
   mutation policy in `plans/technical-decisions.md` forbids rewrites on open.
9. **Explorer overlap.** Journal files are ordinary Markdown, so they also appear
   in the normal file explorer. Whether that is acceptable or the journal folder
   should be visually distinguished is undecided.
10. **Deletion and rename.** Whether the popout offers delete/rename of entries,
    or defers to the file explorer.

### Batch 3 — recorded 2026-08-05

**D14. Calendar surfaces: a grouped list in the popout, a full calendar in a
canvas tab.** *(supersedes the calendar half of D6)*
There is no calendar grid in the left popout. A **full calendar opens from a
button in the journal popout** into a tab on the canvas. The full calendar:

- offers **week** and **month** views;
- can surface per-day metadata such as activity and mood;
- **in the first release shows only a dot on days that have an entry** — richer
  metadata encodings come later;
- exposes its view/display options in a control strip at the **top of the
  calendar tab**.

*Residual question:* D6 gave the calendar its own activity-bar entry. With the
calendar now reached via a button in the journal popout, it is unclear whether a
separate calendar activity-bar button still exists. Confirm before any activity-bar
work; do not assume it was removed.

**D15. The journal popout body is a "calendar list", not a calendar widget.**
Literally a list of entries grouped by day, week, month, or year — the grouping
control from D10. No date grid, no month cells, no mini-calendar in the popout.
Anything resembling a real calendar visualization belongs to the full calendar
tab (D14) and must not be pulled into the popout.

**D16. Search is full text over entries and may reuse the existing search
infrastructure, scoped to journal entries.**
This confirms the dependency flagged in Batch 2 analyst note 2: journal search
builds on the app's existing search rather than a journal-private mechanism.

**Filter/search interaction:** when filters are already active (for example a
date range), search runs **within** the filtered set and the UI must
**emphasize the active filters** so the user does not mistake a filtered result
set for the whole journal. A muted or easily-missed filter indicator is a defect,
not a style choice.

### Analyst notes — gaps raised by Batch 3

11. **Day-click behavior in the full calendar** is undefined: open that day's
    entry, filter the popout list to that day, or something else — and what
    happens when the day holds several entries (D8).
12. **Dot semantics with multiple entries.** One dot per day regardless of count,
    or a count/intensity indication.
13. **Calendar tab identity.** Whether the calendar reuses a single tab or can be
    opened multiple times, and whether its view options persist across sessions
    and per workspace.
14. **Filter scope between surfaces.** Whether the full calendar inherits the
    popout's active filters or maintains its own.
15. **Clearing filters.** D16 requires emphasizing active filters; a discoverable
    "clear filters" affordance is implied but not specified.
16. **Calendar tab on mobile.** The canvas/tab model on phone widths is not
    described; D12 only covers the popout going full screen.

### Batch 4 — recorded 2026-08-05

**D17. Default path and filename: `journal/YYYY/MM/YYYY-MM-DD-HHmm.md`.**
Year and zero-padded month folders, with the file named by ISO date plus a
24-hour time **to the minute**. Example: `journal/2026/08/2026-08-05-1307.md`.
The `journal` root remains configurable per D7; the nesting and filename pattern
above are the defaults.

**The time component is always present** — it is not a collision fallback. Every
new entry appends the current time.

**D18. "New entry" always creates a new file.** It never reopens or appends to an
existing entry, even when one already exists for today. Opening a past entry
happens through the popout list (D9), not through the create action.

**D19. Dates use local device time; backfilling is allowed.**
"Today" is decided by the device clock. The user may create or adjust entries for
past dates. No workspace-pinned timezone and no configurable day-start offset in
the first slice.

### Analyst notes — gaps raised by Batch 4

17. **Date authority is undefined and is the highest-risk open item.** With dates
    encoded in the filename *and* backfill allowed, it is unspecified whether the
    filename, a frontmatter date field, or the filesystem timestamp is the source
    of truth for grouping, calendar placement, and ordering. Renaming a file or
    editing a date field would then disagree. The frontmatter contract story
    cannot proceed without this.
18. **Same-minute collision.** Two entries created inside the same minute produce
    the same filename. A collision rule is required.
19. **No "open today" action.** D18 makes create always-new, and D1 described
    resuming today's entry — so the popout menu likely needs a distinct "today"
    affordance separate from "new entry". The top-menu item list is still
    unspecified.
20. **Backfill mechanics.** Whether backfilling means choosing a date in a create
    dialog, editing a date field afterwards, renaming the file, or all three — and
    what time component a backfilled entry receives.
21. **Timezone drift.** Filenames record local wall-clock time with no offset, so
    entries written across timezones or a DST boundary may order or group
    surprisingly. Acceptable for a local-first journal, but worth stating rather
    than discovering.
22. **Folder creation on backfill.** Backfilling into a past year or month implies
    creating `YYYY/MM` folders that do not exist yet.

### Batch 5 — recorded 2026-08-06

**D20. Both the filename and a frontmatter date are written; the filename wins on
conflict.** *(resolves analyst note 17)*
Each entry carries its date in the filename (D17) and in a frontmatter field. The
two are expected to agree. When they disagree — after a manual rename, an external
edit, or a sync artifact — the **filename is authoritative** for grouping,
calendar placement, and ordering. Consequences for downstream stories:

- The frontmatter date is a convenience/portability copy, not the source of truth.
- Reading a note must not rewrite a disagreeing frontmatter date; that would
  violate the frontmatter mutation policy in `plans/technical-decisions.md`.
  Surfacing the mismatch is acceptable; silently repairing it is not.
- A file whose name does not parse as a date needs defined handling (open).

**D21. No templates in the first slice.**
New entries are not pre-filled from a template. Templates are not rejected as a
future idea, but nothing in the first release reads a template file or a template
setting. `pending-journal_service_daily_notes-high-med.md` should drop template
application from its first increment.

### P1. Proposed journal popout header — PROPOSAL, NOT APPROVED

The product owner asked for a recommendation rather than supplying a menu list.
The following is a proposal for approval. **It is not a decision and must not be
implemented or treated as settled.** It is recorded here so the approval has
something concrete to accept, amend, or reject.

Design intent: this is a narrow side panel, not the main canvas. Keep it to three
compact zones and push anything rare into an overflow menu.

**Zone 1 — action row**

| Item | Form | Behavior |
|---|---|---|
| New entry | Primary button, label + icon | Always creates a new file (D18) |
| Today | Icon button | See the "Today" note below |
| Calendar | Icon button | Opens the full calendar tab (D14) |
| Overflow `...` | Icon button | Rarely used items, e.g. journal settings, reveal folder |

**Zone 2 — search row**
A single full-width search input (full text, D16).

**Zone 3 — control strip**
A thin row beneath search: group-by as a compact dropdown on the left showing the
current value (`Week` by default, D10), and a filter button on the right that
opens a popover of the auto-populated metadata filters. The filter button carries
a count badge when filters are active.

**Active-filter chips.** When any filter or search is active, a chip row appears
under the control strip listing each active constraint with an individual dismiss
control, plus "Clear all". This is how P1 satisfies D16's requirement that active
filters be emphasized, and it supplies the clear-filters affordance flagged in
analyst note 15.

**Proposed "Today" behavior — needs explicit approval.** D18 makes "new entry"
always create a new file, which removed the "resume today's entry" path from D1.
The proposal: **Today opens the most recent entry for today if one exists, and
creates one if none does.** This restores the D1 workflow without weakening D18.
Two alternatives were considered and are recorded as rejected-for-now, not
dismissed: (a) Today merely scrolls the list to today without opening anything —
simpler but leaves D1 unserved; (b) no Today action at all — smallest surface but
makes the most common daily action a two-step scroll-and-click.

### Analyst notes — gaps raised by Batch 5

23. **Unparseable filenames.** D20 makes the filename authoritative, so a journal
    folder file whose name is not a date needs defined behavior: hidden, shown
    ungrouped, or flagged.
24. **Files in the journal folder that are not entries.** Related to 23 — a user
    may drop an ordinary note or an attachment into the journal folder.
25. **Rename consequences.** Renaming a file changes its date under D20, silently
    moving it in the calendar and list. Whether the app should warn is undecided.
26. **Empty new entries.** With no templates (D21), it is unspecified whether a
    new file is completely empty or arrives with a frontmatter block pre-seeded
    with the configured fields.
27. **Nesting versus filename date.** D17 stores files under `YYYY/MM` folders
    that duplicate the filename date. If a rename makes the filename disagree with
    its folder, D20 says the filename wins — so the folder is also cosmetic, and
    whether the app relocates the file is undecided.

### Batch 6 — recorded 2026-08-06

**D22. A new entry contains frontmatter with the date only.**
Creation writes a minimal frontmatter block carrying the entry date (per D20, the
frontmatter copy of the filename date) and nothing else. Configured metadata
fields are **not** pre-seeded with empty values — the file stays clean until the
user actually sets something through the form widget (D11). Combined with D21,
there is no body content in a new entry.

**D23. Metadata field definitions may be defined globally or per workspace.**
Both levels exist. The user keeps the fields they always want at the app level and
customizes per workspace for a specific journal. The precedence and merge rules
between the two levels are not settled here and belong to
`pending-journal_settings_and_accessibility-med-med.md`; that story must define
whether a workspace definition replaces, extends, or shadows a global one of the
same name.

### M1. Mockup v1 — PROPOSAL, NOT APPROVED

A low-fidelity interactive mockup of P1 was produced for review, built with the
repository's real `--tn-*` dark tokens so proportions and chrome read true. It is
explicitly not a final visual style and not an approved information architecture.

States covered: desktop default; desktop with search and three filters active;
the full calendar tab; mobile full-screen popout. Unresolved questions are marked
inline in amber rather than silently resolved — the calendar activity-bar icon
(D14 residual), an unparseable filename in the list (note 23), day-click and dot
semantics (notes 11-12), cross-surface filter scope (note 14), and the mobile
return path.

The mobile bottom navigation shown is **one composition option, not a decision**.
D12 said the popout goes full screen but never specified how the user returns to
the editor; the mockup makes that gap visible instead of assuming a bottom bar.

### Analyst notes — gaps raised by Batch 6

28. **Global/workspace precedence.** D23 establishes two levels without merge
    semantics: replace, extend, or shadow on name collision, and what happens when
    a workspace narrows a global select list that existing entries already use.
29. **Minimal frontmatter and the widget.** D22 means most entries have no field
    keys at all, so the form widget must render configured fields that are absent
    from the file without treating absence as invalid.

### Batch 7 — recorded 2026-08-06

**D24. M1/P1 approved as the structural basis, with one change: the entry
metadata widget starts collapsed.**
The popout zone structure, the grouped list, the filter-emphasis treatment, and
the calendar tab composition are accepted as the basis for the wireframe set and
downstream stories. The metadata form as drawn reads as too busy, so it is
**collapsed by default** and the user expands it. Visual density cleanup beyond
that is explicitly deferred — later refinement is expected and is not a blocker.

Consequences: the collapsed state is the default in every subsequent mockup and in
`pending-journal_panel_ui-high-hard.md`. The collapsed header still needs to
communicate whether the entry has metadata set, so a summary affordance is likely
required — the exact summary treatment is not yet decided.

**D25. Clicking a day in the full calendar filters the popout list to that day.**
*(resolves analyst note 11)*
A day click is a filtering action, not an open-file action. It does not open an
entry, even when the day has exactly one. This makes the calendar a **navigation
and filtering surface that drives the popout**, and it partially answers note 14:
the two surfaces share filter state rather than maintaining independent filters.

Follow-on questions this creates: what happens when the popout is closed at the
time of the click, and whether the resulting date filter appears as a dismissible
chip like any other filter (P1 suggests yes, but it is now load-bearing).

**D26. Mobile popout placement is the app's concern, not the journal
extension's.** *(resolves the mobile return path question)*
On mobile all popouts are treated uniformly: a subset is surfaced in the bottom
navigation and the remainder in a left hamburger menu. The journal extension
registers an ordinary popout and inherits this behavior automatically. It must not
implement bespoke mobile navigation, a private bottom bar, or its own return path.

Consequences: the bottom bar drawn in M1 is **descriptive of the app shell, not a
journal design decision**, and `pending-journal_mobile_refinement-med-med.md`
should narrow to journal-specific concerns — touch targets, the collapsed metadata
widget, list density, and calendar-tab behavior on a phone — while deferring
navigation composition to the mobile/UI-shell epics
(`plans/mobile/pending-responsive_layout-low-med.md`).

### Analyst notes — gaps raised by Batch 7

30. **Collapsed-state summary.** With the widget collapsed by default (D24), the
    collapsed header needs to indicate whether metadata exists on this entry
    without expanding — otherwise set values become invisible.
31. **Day click with the popout closed.** D25 targets the popout; behavior when
    the popout is not open is undefined (open it, or filter silently).
32. **Date filter as a chip.** Whether the calendar-driven date filter is a
    first-class dismissible chip, and what clears it.
33. **Calendar tab on a phone.** Still open — D26 covers popouts, but the calendar
    is a canvas tab, not a popout.

### Batch 8 — recorded 2026-08-06

**D27. There is no calendar activity-bar button. The journal button is the only
activity-bar entry.** *(fully supersedes D6; closes the D14 residual)*
The activity bar is for popouts, and the calendar is a canvas tab, not a popout —
so it does not belong there. The calendar is reached only through the calendar
action in the journal popout (D14).

Consequences: `pending-calendar_panel_ui-high-hard.md` is misnamed relative to this
decision — the calendar is a **tab view, not a panel**, and it must not register an
activity-bar contribution. Its registration path differs from the journal popout's
and needs to be re-examined against the panel registry and tab-kind registry.

**D28. The metadata form widget appears for any note in the journal folder, plus
any note anywhere that already carries the configured fields.**
Two triggers, either sufficient: location inside the configured journal folder, or
the presence of the configured field keys in the note's frontmatter. A note
outside the journal folder that carries the fields still gets the form, which keeps
the feature useful for notes that were moved, and honors D2 — nothing about the
widget depends on a special file type.

Consequences: the widget cannot be gated on the journal folder alone, so the
editor-hook registration must test frontmatter keys as well as path. Field
definitions come from both settings levels (D23), so "the configured fields" is
itself scope-dependent.

**D29. The calendar shows one dot per entry, capped.**
A day with three entries shows three dots; a day with many shows the cap. The cap
value is not yet chosen. This preserves the "several entries today" signal that a
single dot would erase.

### Analyst notes — gaps raised by Batch 8

34. **Cap value and overflow affordance.** D29 needs a specific cap and a treatment
    for days over it (a "+N", a different mark, or nothing).
35. **Dots in week view.** D29 is described for month cells; week view has more
    room per day and may want a different treatment.
36. **Calendar story mismatch.** `pending-calendar_panel_ui-high-hard.md` is framed
    as a panel; D27 makes it a tab. The story needs renaming/rescoping, and the
    epic's story table and dependency notes need updating.
37. **Widget trigger cost.** D28's frontmatter-key trigger means every opened note
    is tested against the configured field list — cheap per note, but it makes the
    widget's behavior depend on settings state at open time.

### Batch 9 — recorded 2026-08-07

**D30. Same-minute collisions get a counter suffix.**
When `YYYY-MM-DD-HHmm.md` already exists, the next entry becomes
`YYYY-MM-DD-HHmm-2.md`, then `-3`, and so on. Seconds are never added; the minute
stays the finest time unit in the filename (D17).

Consequences: the filename parser must accept an optional `-N` counter and must not
mistake it for part of the time. Ordering within a minute follows the counter.

**D31. Accessibility must-haves for the first release: keyboard operation and
screen-reader compatibility.**
Both are required, not optional, for the popout (actions, search, group-by, filter
popover, list rows) and the calendar tab (grid navigation, view switching, day
activation per D25).

Explicitly deferred, to be picked up later or when trivially cheap: reduced-motion
handling and a formal minimum-touch-target audit. **High contrast is out of scope
for this feature** — it is handled by the theme system, and the journal must simply
use `--tn-*` tokens rather than hard-coded colors so themes work.

This narrows the epic's accessibility question, which had listed keyboard,
screen-reader, reduced-motion, and high-contrast as one undifferentiated block.

### P2. Proposed handling of undated files — PROPOSAL, NOT APPROVED

The product owner's direction: show undated files flagged, position them using file
modified time, and allow filtering to find them — while noting the real risk that a
user with ten years of entries would never scroll to them, and the legitimate case
of a journal folder holding undated notes on purpose. The owner asked for a
recommendation. This is that recommendation, not a decision.

**The problem with positioning by mtime.** In a list whose entire organizing
principle is chronology (D9, D15), placing an undated file at an mtime-derived
position makes the row assert a date it does not have. Worse, mtime changes on every
edit, so the file silently relocates between sessions — and under the ten-year
scenario it lands in a group nobody scrolls to. Flagging it does not fix that,
because the flag is only visible once you have already found it.

**Recommendation — lift undated files out of the chronological stream:**

1. **A dedicated "Undated" group pinned to the top of the list**, collapsed by
   default, with a count. Top rather than bottom because it is the only position
   guaranteed to be seen; collapsed because it is usually noise. **When there are no
   undated files the group is absent entirely**, so the ordinary user never meets
   this concept.
2. **Order within that group by mtime.** Inside an explicitly undated group, mtime
   ordering implies nothing false and is genuinely the most useful order.
3. **A filter option for undated / flagged files**, as the owner suggested, so they
   are reachable deliberately rather than only by scrolling.
4. **Split the file kinds.** Non-Markdown files (images, PDFs, attachments) are
   **hidden** from the popout — they are the file explorer's job and the journal
   list is a list of entries. Only **undated Markdown** appears in the Undated
   group. This keeps an attachments subfolder from flooding the list.

**On the deliberate folder of undated notes.** The same mechanism serves it: such a
user expands the Undated group, or filters to undated-only, and gets exactly a plain
note list. If that turns out to be a real workflow rather than an edge case, the
natural follow-up is for the group-by control to gain a mode that treats all files
uniformly — but that is a future consideration, not part of this proposal.

**Rejected alternative:** hiding undated files entirely. Simplest to build, but it
makes files silently invisible in a folder the user owns, which contradicts the
Markdown-first, no-surprises posture in `plans/app-vision.md`.

### Analyst notes — gaps raised by Batch 9

38. **Flag semantics.** If P2 is accepted, "flagged" needs a defined meaning and an
    accessible name — undated is a category, not an error, and should not be styled
    as a failure.
39. **Counter and backfill.** D30's counter interacts with backfill: a backfilled
    entry for a past date may need a counter against entries already on that date.
40. **Keyboard model for the calendar grid.** D31 requires keyboard operation but
    the grid's model (arrow-key roving focus, page-per-month, activation semantics
    under D25) is unspecified.

### Batch 10 — recorded 2026-08-07

**D32. P2 accepted in principle, with a hard constraint: undated files must occupy
minimal space.** The presentation is deliberately left open — a full group header
like `Week of Aug 3` is likely too heavy. A small toggle beside the filter control
that reveals ungrouped/undated files is a candidate. **The choice is to be settled
by comparing mockups**, and the mockup set must show both treatments rather than
picking one silently.

What is settled from P2: undated Markdown is not placed in the chronological
stream, is ordered by mtime among itself, is reachable through a filter, and
non-Markdown files are hidden from the popout.

**D33. The only requirement to be a journal entry is a parseable date in the
filename. Read leniently, write one format.**
The reader accepts a wide range of date formats in filenames; the writer only ever
emits the D17 variation. A file is treated as an entry if its name yields a date at
all — nothing else is required, and in particular **frontmatter is not required and
malformed frontmatter does not disqualify an entry**.

Only an **unreadable date format** routes a file to the undated treatment (D32).
The other states the story originally listed — empty, malformed frontmatter,
read-only, unsaved — get **no journal-specific treatment** and rely on existing
editor behavior. Journal stories must not invent bespoke states for them.

**D34. Approval cadence: per-artifact, as each is drafted.**
Each discovery artifact is presented for sign-off on its own rather than batched
into one review. The product owner is the approver and may reject or revise any
artifact. Downstream stories are updated only after the artifacts they depend on
are approved.

### Analyst notes — gaps raised by Batch 10

41. **Ambiguous dates are a correctness risk, not just a parsing detail.** D33's
    lenient reader will meet names like `01-02-2026`, where day-first and month-first
    readings both parse and disagree. The recommendation for the data-model story is
    to treat genuinely ambiguous formats as **unreadable** (routing them to D32's
    undated treatment) rather than guessing, because a wrong guess silently files an
    entry on the wrong day and the user has no signal. Not decided here.
42. **The accepted-format list needs enumerating** in
    `pending-journal_data_model_frontmatter-med-hard.md`, with tests per format, plus
    the interaction with the D30 counter suffix and with folder nesting.
43. **Lenient read plus single write means filenames drift in shape.** An imported
    journal keeps its original names — the app must never silently rename to
    normalize, per the no-surprises posture. Whether an explicit opt-in normalize
    action exists is a separate future question.

### Batch 11 — recorded 2026-08-07

**D35. Moodboard v1 approved: Direction B ("Page in a Workshop") with Direction A's
popout.** The editor surface is a measured column and the collapsed metadata widget
is a **dateline** — `Wednesday, August 5 · good · 7 · running, outdoors` — which also
serves as the collapsed-state summary required by analyst note 30. The popout keeps
the file-explorer's density and discipline.

Rejected: **Direction A throughout** (the status strip reads as a build status above
personal prose, and nothing in it invites slow writing) and **Direction C, "Data
Journal"** (it conflicts with D4 — a user-defined vocabulary gives the app no basis
for value ordering or color meaning, so the interface would promise capability the
data model cannot support). Direction C may be revisited only if the metadata model
later gains user-supplied ordering and color semantics.

Constraints carried forward: no new color tokens, no mood-color mapping, no emoji
vocabulary, no paper texture or notebook skeuomorphism, no handwriting typefaces, and
no wellness or therapeutic framing. Direction B's measured column needs a defined
behavior at narrow widths and on mobile, where the editor is full width.

**D36. Undated files use a pinned group header.** *(closes D32's open presentation)*
A single `Undated` row pinned to the top of the list, collapsed, with a count, absent
entirely when no undated files exist. The rejected alternative was a toggle beside
the filter control — zero rows and a better fit for a deliberately-undated folder,
but a small badge is too easy to ignore, and discoverability won: a stray
`README.md` should be noticed once without the user going looking for it.

The rest of P2 stands: undated Markdown stays out of the chronological stream,
orders by mtime among itself, is reachable by filter, and non-Markdown files are
hidden from the popout.

### Batch 12 — recorded 2026-08-07

**D37. Desktop IA approved as IA-3, a hybrid: a flat stream with collapsible
headers and no indentation. The group-by control is removed.**
*(supersedes the `Group by` row of D10)*

- The list is **visually flat** — headers are not indented and rows do not sit inside
  a tree. It reads as one stream, not a hierarchy.
- **Headers collapse**, which is what delivers IA-2's ten-year navigability without
  IA-2's tree semantics or its conflict with a group-by control.
- **No group-by control.** The `none / day / week / month / year` options and the
  `week` default from D10 are withdrawn. Grouping becomes a fixed property of the
  list rather than a user setting.
- **Retained from D10:** full-text search (D16) and metadata filtering with
  auto-populated values. These are now the only two list controls, which simplifies
  the popout header from P1's three zones.

Rejected: **IA-1 as drawn** (a non-collapsing flat stream leaves the archive
reachable only through another surface) and **IA-2 as drawn** (indentation plus tree
keyboard semantics, and it contradicted D10's group-by control — a contradiction
D37 instead resolves by removing the control).

*Open:* which header levels exist. "Collapsible headers" with no group-by control
implies a fixed set — month headers only, or year plus month headers. Not decided;
both are drawn for comparison.

**D38. Ambiguous filename dates are treated as undated. The app never guesses.**
*(closes analyst note 41)*
A name like `01-02-2026`, where day-first and month-first both parse and disagree, is
**not** an entry — it goes to the Undated group (D36). Guessing is rejected outright,
including guess-with-a-flag: a wrong guess files an entry on the wrong day, and the
calendar and list would both show it confidently in the wrong place.

Consequence for `pending-journal_data_model_frontmatter-med-hard.md`: the accepted
format list must be enumerated such that every accepted format is *unambiguous*, and
ambiguity detection needs its own tests. This is a correctness requirement, not a
nicety.

### Analyst notes — gaps raised by Batch 12

44. **Header levels undecided** (see D37) — month-only versus year-plus-month.
45. **Collapse state persistence.** Whether collapsed headers stay collapsed across
    sessions, and whether that state is per workspace.
46. **P1's control strip shrinks.** With group-by gone (D37), the popout header has
    search plus filter only. P1's zone 3 should be re-drawn rather than left with a
    hole where the group-by dropdown was.
47. **Collapsed headers and search.** When a search or filter matches entries inside a
    collapsed header, the header must either auto-expand or show a match count —
    otherwise results are silently hidden.

### Batch 13 — recorded 2026-08-07 (discovery complete)

**D39. IA-3 header levels: year plus month, both collapsible, neither indented.**
Levels are distinguished by weight, size, case and background — never by padding.
Rejected: month-headers-only (3a), because 96 collapsed month rows is still a scroll
and it therefore fails the ten-year case that motivated the collapsible design.

**D40. Mobile: M-1's compact list with M-2's bottom sheet for metadata editing.**
One list implementation shared with desktop, and the bottom sheet confined to metadata
editing — the four input types from D4, multi-select especially, do not fit inline on a
phone. Rejected: M-1 throughout (inline multi-select is cramped) and M-2 throughout
(halves the entries visible while browsing). Acknowledged cost: a bottom sheet is new
component surface the desktop app uses nowhere else.

## Checkpoint table

| Artifact / version | Reviewer | Status | Follow-up |
|---|---|---|---|
| Question batches 1-10 (D1-D34) | product owner | ✅ answered | — |
| P1 popout header v1 | product owner | ✅ approved with change (D24) | Metadata widget starts collapsed |
| M1 interactive mockup v1 | product owner | ✅ approved as structural basis (D24) | Visual density cleanup deferred |
| P2 undated-file handling | product owner | ✅ accepted with constraint (D32) | Minimal space; treatment compared |
| Moodboard v1 (artifact 1) | product owner | ✅ approved (D35) | Direction B + A's popout; C rejected |
| Undated treatment comparison | product owner | ✅ approved (D36) | Pinned group header chosen |
| Desktop IA v1: IA-1 vs IA-2 (artifact 2) | product owner | ✅ resolved as IA-3 (D37) | Group-by control removed |
| State coverage, 12 states | product owner | ✅ reviewed with artifact 2 | Referenced by the panel story |
| Keyboard / screen-reader focus order | product owner | ✅ reviewed with artifact 2 | Calendar grid model still open |
| IA-3 header levels: 3a vs 3b | product owner | ✅ approved 3b (D39) | — |
| Mobile layouts M-1 vs M-2 (artifact 3) | product owner | ✅ approved hybrid (D40) | Bottom sheet is new component surface |

**Approver:** the product owner, per D34. Any artifact may be rejected or revised by
the product owner at any time; a superseding decision is recorded as a new D-number
rather than by editing an earlier one.

## Rejected alternatives (consolidated)

| Rejected | In favor of | Why |
|---|---|---|
| Calendar widget in the popout | Grouped list (D15) | A real calendar belongs in the canvas tab |
| One panel with switchable views | Journal popout + calendar tab (D14) | The activity bar is for popouts |
| Calendar activity-bar button | Popout button only (D27) | The calendar is a tab, not a popout |
| Templates in the first slice | No templates (D21) | Not needed for the first usable slice |
| Pre-seeded empty metadata fields | Date-only frontmatter (D22) | Keeps files clean until values are set |
| Seconds in filenames | Counter suffix (D30) | Minute stays the finest unit |
| Guessing ambiguous dates | Undated (D38) | A wrong guess silently misfiles an entry |
| Hiding undated files | Pinned group (D36) | Invisible files in a user-owned folder |
| Toggle beside the filter for undated | Pinned group header (D36) | A small badge is too easy to ignore |
| Direction A "Quiet Instrument" | Direction B (D35) | Status strip reads as build status over prose |
| Direction C "Data Journal" | Direction B (D35) | Contradicts D4's user-defined vocabulary |
| IA-1 flat non-collapsing stream | IA-3 (D37) | Archive reachable only via another surface |
| IA-2 indented drill-down | IA-3 (D37) | Indentation + tree semantics; clashed with group-by |
| 3a month headers only | 3b year + month (D39) | 96 collapsed rows still fails the ten-year case |
| M-1 inline metadata throughout | M-1 + sheet (D40) | Multi-select is cramped inline on a phone |
| M-2 comfortable rows throughout | M-1 + sheet (D40) | Halves entries visible while browsing |
| Bespoke mobile navigation | App shell owns it (D26) | Popout placement is not a journal concern |

### Open questions carried forward

**Blocking discovery sign-off**

*No open item blocks discovery sign-off. All three artifacts are approved (D35,
D37/D39, D40).*

- Collapsed-header behavior under search/filter (note 47) and collapse-state
  persistence (note 45) — journal panel story.
- Narrow-width and mobile behavior of Direction B's measured column (D35).

**Deferred to the owning implementation story (not blocking discovery)**

- Per-day aggregation policy for the calendar (D8 provisional) —
  `pending-calendar_data_model-med-med.md`.
- Global versus workspace field precedence and merge rules (note 28) —
  `pending-journal_settings_and_accessibility-med-med.md`.
- Dot cap value, overflow treatment, dots in week view (notes 34-35) —
  calendar view story.
- Calendar tab singleton and option persistence (note 13); calendar on a phone
  (note 33); keyboard model for the calendar grid (note 40).
- Collapsed-state metadata summary treatment (note 30); widget behavior on
  malformed frontmatter, which D33 keeps as a valid entry (note 8) — journal
  panel story.
- Enumerating accepted date formats and rejecting ambiguous ones (notes 41-43) —
  `pending-journal_data_model_frontmatter-med-hard.md`.
- Day click with the popout closed; date filter as a chip (notes 31-32).
- Backfill mechanics, time component of a backfilled entry, counter interaction
  (note 39); rename warnings and folder relocation (notes 25, 27) —
  journal service story.
- Field-definition drift and orphaned metadata display (note 6).

## Reconciliation — 2026-08-07 (post-merge)

The `extensions` branch advanced by nine commits between the start of discovery and the
final push of these plans. **No decision in this log changed**, and no pushed file
overwrote newer work — every write was made against an explicit blob SHA, so a stale base
would have been rejected rather than silently clobbering. The two asset files that already
existed were discovery placeholders reading "Status: placeholder pending product-owner
discovery", which these artifacts were written to replace.

What landed: an extension platform core (manifest parsing, capability compatibility,
lifecycle bootstrap, lazy activation), a `Note Stats` built-in, live extension status, a
markdown live-preview editor extension behind a settings toggle, and four fixes (symlink
escape in markdown commands, core note offsets, settings staging during in-flight saves,
live-preview reparse).

Consequences are recorded in the epic's **Platform reality check** section and in the
affected stories. In summary, three approved decisions have no complete implementation
path on today's platform and are STOP-gated in their owning stories rather than
weakened:

- **D14 / D27** — the calendar tab. No `"canvas"` tab kind and no `tabs` contribution
  surface exist; `TabContent.tsx` must gain a rendering branch. A shell change, untracked
  by any story.
- **D11 / D24 / D35** — the metadata widget. `editorHooks` inject CodeMirror extensions
  only; there is no React slot above the editor body. Two candidate routes recorded, the
  choice deliberately left open.
- **D23** — per-workspace field definitions. All extension settings are currently
  `scope: "app"` with no workspace-scoped path, and extension settings are not yet
  rendered in the settings UI.

None of this reopens a product question. Each item is a platform prerequisite, and the
decision it serves stands as approved.

## Acceptance criteria

- [x] User answers recorded for workflow (D1, D9), date/time policy (D19, D20, D33,
  D38), folder/naming (D7, D17, D30), templates (D21), metadata fields (D3, D4, D22,
  D23), calendar defaults (D14, D25, D29), settings (D23), accessibility (D31), and
  mobile behavior (D12, D26, D40).
- [x] Three labeled alternatives for composition (IA-1, IA-2, IA-3) plus two mobile
  alternatives; none treated as chosen before approval, and the resolution (IA-3) was
  the product owner's, not the author's.
- [x] Twelve states covered: no workspace, no journal folder, zero entries, new entry,
  existing entry with metadata, malformed frontmatter, calendar-filtered day, filter
  matching nothing, unreadable folder, index unavailable, undated group expanded,
  ambiguous date.
- [x] Desktop and phone layouts identify focus order (popout, 10 stops), accessible
  names, touch-target intent, and responsive behavior. The calendar grid keyboard
  model is explicitly deferred rather than guessed (note 40).
- [x] Checkpoint table names artifact version, reviewer, status, and follow-up.
- [x] Non-goals and unresolved decisions are listed for downstream authors, split into
  discovery-blocking versus owned-by-a-later-story.

## Tests / manual checks

- No automated code tests expected.
- Manual: walk the proposed daily workflow with a real sample workspace; verify each screen can be described without assuming a final visual style or metadata vocabulary.
- Manual: review with keyboard-only and a screen reader outline; check that every action has a discoverable label in the wireframe.

## Non-goals

- No React/CSS/Tailwind implementation, no production assets, no frontmatter parser changes, no settings schema, and no extension registration.
- Do not select a mood scale, activity taxonomy, folder hierarchy, filename format, icon, color meaning, or calendar visualization without explicit approval.
- Do not ship a built-in mood or activity vocabulary; D4 makes these user-defined.
- Do not settle the calendar's per-day aggregation rule here; D8's "last one wins"
  is a provisional placeholder owned by the calendar data-model story.
