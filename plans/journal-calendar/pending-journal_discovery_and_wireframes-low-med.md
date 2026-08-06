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
