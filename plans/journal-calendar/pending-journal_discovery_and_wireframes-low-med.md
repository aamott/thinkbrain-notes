# Story: Journal Discovery, Moodboards & Wireframes

**Status:** pending · **Urgency:** low · **Difficulty:** med

## Epic

Part of [Journal & Calendar](../pending-journal-calendar-high-hard.md). This is the discovery gate; it must precede irreversible data and UI work.

## Questions first

- What job should the first 30 seconds of journaling accomplish?
- Is the calendar primarily navigation, reflection, metadata filtering, or all three?
- Which journal entry states need distinct affordances (missing, empty, malformed, read-only, unsaved)?
- Which moods, activities, date ranges, and template controls are necessary for the first usable slice?
- Should desktop show two activity-bar entries, and what is the smallest useful mobile navigation model?
- What does the user need to approve at each mockup checkpoint, and who may reject or revise it?

**STOP gate:** Ask the product owner these questions, capture answers, and stop. Do not create a production component, final schema, final folder/name syntax, or implementation PR until the answers and a first desktop/mobile wireframe are explicitly approved.

## Goal

Produce a decision record and low-fidelity moodboard/wireframe set that separates confirmed requirements from open questions. Explore at least two journal/calendar information architectures without presenting either as final.

## Likely files

- `plans/journal-calendar/pending-journal_discovery_and_wireframes-low-med.md` (this decision log, updated with answers and approvals).
- `plans/journal-calendar/assets/journal-calendar-moodboard.md` (new; text references and visual direction, if the repository keeps discovery artifacts as Markdown).
- `plans/journal-calendar/assets/journal-calendar-wireframes.md` (new; desktop and mobile wireframes/alternatives, or links to approved artifacts).
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
year/month/day are out of scope. The exact default (flat versus nested) and the
exact filename pattern are NOT yet decided and are asked in Batch 2.

### Open questions carried forward

- Whether "date and time" in filenames means one entry per day or multiple
  timestamped entries per day (D7 mentions both date and time).
- Default folder nesting and exact filename pattern.
- Whether day-level metadata fields are per-workspace or global to the app.
- Everything in the Batch 2+ list below.

### Not yet asked

Date/time semantics and backfill rules; folder/filename defaults; template
handling; entry-state affordances; calendar default view; settings scope;
accessibility requirements; mobile navigation model; mockup approval cadence.

## Acceptance criteria

- [ ] User answers are recorded for workflow, date/time policy, folder/naming, templates, mood/activity metadata, calendar defaults, settings, accessibility, and mobile behavior.
- [ ] At least two clearly labeled alternatives are shown for panel/navigation composition; no alternative is treated as chosen until approval.
- [ ] Wireframes cover first-run/no-workspace, no-entry, existing-entry, invalid-frontmatter, create/edit, calendar filtering, and error states.
- [ ] Desktop and phone layouts identify focus order, touch targets, accessible names, and responsive transitions.
- [ ] A checkpoint table names artifact version, reviewer, approval/rejection, and follow-up question.
- [ ] The story lists explicit non-goals and unresolved decisions for downstream authors.

## Tests / manual checks

- No automated code tests expected.
- Manual: walk the proposed daily workflow with a real sample workspace; verify each screen can be described without assuming a final visual style or metadata vocabulary.
- Manual: review with keyboard-only and a screen reader outline; check that every action has a discoverable label in the wireframe.

## Non-goals

- No React/CSS/Tailwind implementation, no production assets, no frontmatter parser changes, no settings schema, and no extension registration.
- Do not select a mood scale, activity taxonomy, folder hierarchy, filename format, icon, color meaning, or calendar visualization without explicit approval.
- Do not ship a built-in mood or activity vocabulary; D4 makes these user-defined.
