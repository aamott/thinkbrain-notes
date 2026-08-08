# Journal & Calendar — Proposed Answers to the Open Decisions

**Status: PROPOSAL — nothing here is approved.** Drafted 2026-08-08 for product-owner
review. Each item is written as a decision-log entry (`**D48.**` …) so an approved one can
be moved verbatim into `plans/journal-calendar/pending-journal_discovery_and_wireframes-low-med.md`
after the D47 entry, with a matching checkpoint row and the `D1-D47` headings bumped.

Numbers are provisional. Reject any entry and its number simply goes unused — gaps are
cheaper than renumbering. Every proposal below is bounded by D1–D47; where one refines an
approved artifact, that is called out explicitly rather than assumed.

**Two items on the open list are already closed and need no decision.** The wireframes list
"dot cap and overflow" and "dots in week view" as open, but D46 settled both: up to three
dots then `+N`, and month and week share one density treatment.

---

## 1. Journal frontmatter contract (story 2)

This is the story that unblocks stories 3 through 7.

### D48 — the date key

> **D48.** The journal frontmatter date key is **`date`**, written as a plain `YYYY-MM-DD`
> string with no time component and no quoting (e.g. `date: 2026-08-05`). The time lives in
> the filename only (D17), which remains authoritative on conflict (D20). The key is
> reserved by the journal: a user-defined field (D4) may not be named `date`, nor may it
> reuse the note model's existing reserved keys `title`, `tags`, `aliases`, `status`,
> `created_at`, or `updated_at`.

**Why.** D3 asks for self-describing keys and plain values, and `date` is the plainest
possible spelling. Date-only avoids encoding the same timestamp twice in two places that
can drift, and sidesteps timezone ambiguity entirely, which matters because D19 uses local
device time with no workspace-pinned zone. `created_at` is deliberately not reused: it
already exists in the note model and means "when the file was made", which is a different
fact from "which day this entry is about" — a backfilled entry makes the difference visible.

**Rejected.** `journal-date` (noisy, and namespacing a key inside a file that is already an
ordinary note contradicts D2). A full `date: 2026-08-05T13:07` datetime (duplicates the
filename, invites drift, and D20 already makes the frontmatter copy non-authoritative).

### D49 — field-definition shape

> **D49.** A metadata field definition is `{ id, label, type, options? }`. `id` is the
> literal frontmatter key and must match `^[a-z][a-z0-9_-]*$` and avoid the D48 reserved
> keys; `type` is one of D4's four input types; `options` is required for `single-select`
> and `multi-select` and forbidden otherwise. Frontmatter value shapes are fixed by type:
> `text` and `single-select` write a plain string, `number` writes a plain number, and
> `multi-select` writes a flow list of strings (`context: [running, outdoors]`). No other
> shapes are written, and a definition never changes an existing note (D45).

**Why.** These four shapes are exactly what D43's aggregation already assumes — lists union
across a day, scalars collect into an array — so the contract and the calendar model agree
by construction rather than by coincidence. Constraining `id` to the frontmatter key keeps
files legible under D3: what you see in settings is what you see in the file.

**Note on storage, needs a call.** The settings registry supports `boolean`, `enum`,
`number`, `path`, and `string` only — there is no list or object type — so a set of field
definitions does not fit an existing setting type. There is a `controlRegistry` with
`registerControl` already in the codebase and covered by tests, so my recommendation is one
`string` setting rendered by a custom `journal-field-definitions` control, holding a JSON
array. The alternative is adding a first-class structured setting type to the platform,
which is cleaner but widens D45's already-pending work. I recommend the custom control for
v1 and a platform type later if a second extension needs one.

### D50 — invalid and unknown data

> **D50.** Reading is lenient and never repairs (D20, D33). Unknown frontmatter keys pass
> through untouched. A value whose shape does not match its declared field type is kept
> verbatim on disk, shown in the widget as invalid with a non-blocking notice, and excluded
> from that field's facet values rather than coerced. A frontmatter `date` disagreeing with
> the filename surfaces a mismatch notice and is never rewritten. The journal writes to a
> note only when the user edits metadata through the widget, and then rewrites only the keys
> that changed.

**Why.** Every part of this follows D20 and D33; the only addition is saying what "invalid"
does to facets, and excluding is the honest option — coercing would invent data the user
never wrote.

**Caveat you should know about.** The current serializer round-trips values but not YAML
comments, key order, or quote style; `plans/note-model/pending-comment_preserving_frontmatter_roundtrips-low-hard.md`
owns that and is unstarted. So an explicit metadata edit may reflow a hand-written
frontmatter block. I recommend accepting that for v1 precisely because D50 keeps writes
rare and user-initiated, rather than blocking the journal on the note-model story.

### D51 — compatibility promise

> **D51.** The v1 stable contract is D42's filename table plus D48's `date` key. User-defined
> field keys are user-owned: the app never renames, migrates, or garbage-collects them, and
> a field removed from settings keeps its values in the file and shows as `unconfigured`
> (D45). No schema-version marker is written into notes. Reserving a further frontmatter key
> for the journal in a future release requires a new decision.

**Why.** D2 says an entry is an ordinary note, and a version stamp is the sort of thing that
makes a file look like a database record. The promise that costs us nothing and protects
users most is the one about never touching what we did not write.

---

## 2. Journal panel (story 6)

### D52 — collapsed headers under search

> **D52.** While a search query or metadata filter is active, year and month headers
> containing matches expand automatically and show a match count; clearing the query
> restores the user's previous collapse state. Auto-expansion is transient and is never
> persisted.

**Why.** D16 makes silently hiding matches a defect. A count inside a still-collapsed header
is technically not hiding, but it puts a click between the user and the thing they searched
for, which is the wrong default for the primary action.

### D53 — collapse-state persistence

> **D53.** Collapse state persists per workspace in desktop state, not in settings and not in
> the vault, and is restored when the popout reopens.

**Why.** Which years you have collapsed is window state, not a preference and not user
content — the same category as open tabs and the workspace root, which desktop state already
holds. Per workspace, because collapse state is meaningless against a different set of years.

### D54 — the collapsed dateline with no metadata

> **D54.** An entry with a date and no user-defined field values renders the dateline as the
> date alone — `Wednesday, August 5` — with no separator and no placeholder text. The widget
> offers an explicit `Add metadata` control in its collapsed state. This refines the
> "no metadata set" copy shown in state 4 of the approved wireframes (D37/D39).

**Why.** D22 makes empty the normal state of every brand-new entry, so placeholder text would
appear on the majority of rows and read as an unfinished chore rather than information. The
affordance still needs to exist, which is why it moves to a button in the widget instead of
disappearing entirely.

**This one contradicts an approved artifact**, so it needs a real decision rather than an
assumption; if you prefer the wireframe's copy, reject D54 and the wireframe stands.

### D55 — narrow-width column behavior

> **D55.** The measured row responds to the **popout's own width**, not the viewport, at two
> breakpoints. At or above 320px the row shows date, time, and first line. Below 320px the
> time joins the date line and the first line wraps beneath it. Below 260px the first-line
> preview is dropped and the row is date and time only. `pending-journal_mobile_refinement-med-med.md`
> consumes these numbers and must not define a second breakpoint.

**Why.** Container width rather than viewport width is what actually determines whether the
columns fit, and it is the only version that stays correct when the popout is resized on a
desktop. Two breakpoints cover the real cases without inventing a third layout nobody asked
for.

---

## 3. Calendar (stories 4 and 7)

### D56 — one calendar tab, with persisted options

> **D56.** The calendar is a singleton tab: invoking `open-calendar` focuses the existing tab
> if one is open. View mode (week or month) and the active date persist per workspace and are
> restored when the tab reopens.

**Why.** D25 gives the calendar and the popout shared filter state; two calendar tabs would
make "the" filter ambiguous with no good answer. Persisting the view is what makes the tab
feel like a place rather than a dialog.

### D57 — the calendar at phone widths

> **D57.** Both week and month views are available on a phone. The option strip collapses to a
> single segmented control. Day cells render dots only, with the `+N` remainder text dropped
> below 40px cell width while the exact count remains in the accessible name (D46). The tab
> uses the ordinary canvas tab surface; the journal adds no bespoke navigation (D26).

**Why.** Dropping a view on mobile would make the calendar a different feature on a phone.
The `+N` glyph is the first thing that stops fitting, and D46 already requires the exact
count in accessible text, so removing it visually loses nothing that is not still announced.

**Deferred by D31.** This does not constitute the touch-target audit; the 40px figure is a
layout threshold, not an approved minimum target size.

### D58 — calendar grid keyboard model

> **D58.** The grid is one tab stop with roving focus. Arrow keys move by day, `Home` and
> `End` move to the start and end of the focused week, `PageUp` and `PageDown` move by month
> (with `Shift` by year), and `Enter` or `Space` activates the focused day, which under D25
> means filtering the popout list. The focused day announces its date and exact matching
> entry count.

**Why.** This is the established date-grid pattern, so screen-reader users get behavior they
already know rather than something we invented. One tab stop keeps the grid from swallowing
42 stops in a row, matching how the wireframes already treat the entry list.

### D59 — clicking a day with the popout closed

> **D59.** Clicking or activating a day while the journal popout is closed opens the popout
> and applies the day filter.

**Why.** D25 defines a day click as an action on the popout's list. If the popout is closed,
the alternatives are to do nothing visible — which reads as a broken control — or to silently
set a filter the user cannot see, which is worse. Opening the surface the action targets is
the only option that makes the click honest.

### D60 — the date filter chip

> **D60.** The active day filter appears in the popout's chip row as an independently
> dismissible chip, alongside metadata filter chips and `Clear all`. Dismissing it clears only
> the day filter, and the calendar's day selection clears in step.

**Why.** The approved wireframes already specify a chip row where every chip is dismissible;
making the date the one exception would be a special case with nothing to recommend it. D16's
requirement that active filters be unmistakable applies to a filter set from another surface
at least as strongly.

---

## 4. Journal service (story 3)

### D61 — the time component when backfilling

> **D61.** Backfilling supplies the **date**; the filename's time component is the **current
> clock time** at the moment of creation. Midnight is never fabricated, and the user is not
> asked for a time.

**Why.** D17 says the time component is always present and that every new entry appends the
current time — the backfill case is the same rule applied to a different date, not a new
policy. Writing midnight would fabricate a fact and would make a second backfill for the same
day collide immediately, pushing every backfilled entry into D30's `-2`, `-3` counters for no
benefit.

**Rejected.** Prompting for a time (extra UI on a rare path, and the user typically does not
know or care what time a backfilled entry "happened").

### D62 — folder creation when backfilling

> **D62.** A backfilled entry whose year or month folder does not yet exist creates that
> folder silently. No prompt.

**Why.** The folder path is derived from the date by D17 — it is not a user choice, so there
is nothing to confirm. The existing `create_markdown_file` command already creates parent
folders, so this is also the behavior that requires no special case.

### D63 — error and retry copy

> **D63.** Approved copy for the three failure states, matching wireframe states 9 and 10:
>
> - Journal folder unreadable: **"Can't read the journal folder."** with the path shown
>   beneath, and actions `Retry` and `Choose a different folder…`.
> - No workspace open: **"Open a folder to start journaling."** with action `Open folder…`.
> - Invalid journal root setting: **"The journal folder setting isn't a valid path."** with
>   the offending value shown and action `Open settings`.
>
> Errors state what failed and offer the action that fixes it; they never blame the user and
> never surface a raw error string as the headline.

**Why.** The wireframes fixed the shape of these states but not their words. These follow the
app's existing plainspoken voice and keep the raw detail available without leading with it.

---

## 5. Settings (story 5)

### D64 — the v1 setting list

> **D64.** The journal registers exactly four settings, and no others without a new decision:
>
> | Key | Type | Scope | Default |
> |---|---|---|---|
> | `root` | path | app + workspace | `journal` |
> | `fieldDefinitions` | custom control (D49) | app + workspace (D45) | empty |
> | `calendarDefaultView` | enum `week` \| `month` | app | `month` |
> | `startOfWeek` | enum `system` \| `monday` \| `sunday` | app | `system` |
>
> Explicitly **not** settings in v1: templates (D21), the folder-nesting pattern and filename
> format (fixed by D17), timezone or day-start offset (excluded by D19), and anything
> touching mood colors or iconography (D4, D31).

**Why.** `root` and `fieldDefinitions` are required by D7 and D4/D23. `startOfWeek` is not
optional in practice — a week view has to start somewhere, and hard-coding it is a decision
made badly rather than a decision avoided. `calendarDefaultView` is the one genuinely
discretionary addition, and it is cheap; drop it if you would rather ship with month fixed.

**Nesting, flagged.** D7 bounds nesting to `year/month/day` and D17 sets the default to
`YYYY/MM`, but neither says nesting is user-configurable. I recommend v1 fixes it at D17's
pattern and defers a nesting setting until someone asks, rather than shipping a format
setting that multiplies the parser's test surface.

---

## 6. Registration and host integration (story 9)

### D65 — activation

> **D65.** `journal-calendar` activates lazily on `onView:journal` and on
> `onCommand:new-entry`, `onCommand:today`, and `onCommand:open-calendar`. It does not
> activate at startup.

**Why.** D44 removed activation timing as a correctness constraint for the metadata widget,
which was the only reason to consider startup activation. Lazy activation means users who do
not journal pay nothing, and the manifest still puts the commands in the palette and the
panel in the activity bar before any journal code runs.

### D66 — the beta contribution table

> **D66.** At beta, `journal-calendar` contributes, all real rather than placeholder: panel
> `journal`; tab `calendar`; commands `new-entry`, `today`, `open-calendar`; editor-header
> contribution `metadata-widget`; and its settings module. The popout's action row is
> implemented as panel header actions on the `journal` panel, not as bespoke chrome.

**Why.** The ids are fixed by D47; this only says which are live at beta. The action row lands
on the panel-header actions contract that shipped this week, which is exactly the zone the
wireframes describe — `New entry`, `Today`, `Open calendar`, overflow.

### D67 — mobile representation

> **D67.** The journal registers one ordinary left panel and inherits the shell's mobile
> placement and return path (D26). It contributes no bespoke mobile navigation. The metadata
> bottom sheet (D40) is owned by the widget, not by the panel registration.

---

## 7. Engineering choices (no product decision needed)

These are recorded for completeness; they are mine to make unless you object.

### D68 — service adapter boundary

> **D68.** The journal service goes through `DesktopExtensionContext.workspace`, not the
> workspace adapters directly. Where that API is insufficient it is extended for every
> extension rather than bypassed.

**Why.** `journal-calendar` is a built-in extension by D47, and routing it through the same
API a third party would use is what keeps that API honest — if the journal needs something
the public surface lacks, that is a gap worth fixing rather than routing around.

**Known gap this exposes.** `context.workspace` today has `readNote`, `writeNote`,
`createNote`, `openNote`, and `rootPath` — there is **no way to list notes**, which the
journal needs to browse entries at all. This has to be added; I would add
`listNotes(prefix)` returning relative paths with modified times, since D32 also needs mtime
ordering for undated files.

### D69 — the calendar tab-open route

> **D69.** `DesktopExtensionContext.tabs` gains a scoped `open(kind, title)` restricted to tab
> kinds the calling extension registered. The internal `openTab` stays internal.

### D70 — calendar factory context

> **D70.** `DesktopTabContext` stays `{ rootPath, tabId }` for v1. The calendar reads
> everything else from the journal service and its own settings, so widening it now would be
> speculative.

---

## Suggested order

1. **D48–D51 first.** They unblock stories 3, 4, 6, and 7, and they are the only ones that
   are expensive to change later, because they touch what gets written into users' files.
2. **D61–D64 next**, which lets the journal service and settings stories run.
3. **D52–D60 with the mockups**, since D34 requires per-artifact sign-off for the UI stories
   anyway and these decisions are easier to judge against a drawing.
4. **D65–D70 last**, alongside the platform prerequisites (D44 editor-header slot, D45
   workspace-scoped settings, D41 metadata facets, and the D68/D69 API additions).
