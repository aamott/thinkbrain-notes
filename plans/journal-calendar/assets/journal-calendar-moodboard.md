# Journal & Calendar — Moodboard Direction

**Status:** APPROVED 2026-08-07 (see D35) · **Artifact 1 of 3** · Cadence per D34

> Discovery artifact for [Journal Discovery, Moodboards & Wireframes](../pending-journal_discovery_and_wireframes-low-med.md).
> This describes visual and tonal *direction* only. It selects no final palette,
> type scale, icon set, or component. Nothing here is approved until the product
> owner signs off on this file specifically.

## What this artifact is for

The journal is the first feature in ThinkBrain that is **emotional rather than
technical**. Every other surface so far — explorer, search, Git, settings — serves a
developer-tool posture. A journal is where someone writes "rough one, didn't sleep
well." The direction has to reconcile those two facts without letting either win
outright.

The constraint that makes this tractable: per `plans/technical-decisions.md` the
journal has **no license to invent visual language**. It uses the existing `--tn-*`
tokens, CSS Modules, and the established shell chrome. So this is not a palette
exercise. It is a decision about *where the journal sits on the spectrum between
tool chrome and writing surface*, expressed through density, hierarchy, and
restraint rather than new colors.

## The tension, stated plainly

| Pulls toward tool | Pulls toward journal |
|---|---|
| Lives in an activity-bar popout beside the file explorer (D9) | Content is personal prose, not code |
| Must stay legible at thousands of entries (D13) | A day's entry is read slowly, one at a time |
| Filter, search, group-by controls (D10) | Mood and activity are felt, not queried |
| Entries are ordinary Markdown files (D2) | The folder is a decade of someone's life |

The resolution this direction proposes: **the chrome stays a tool; the editor
becomes a page.** The popout should feel like the explorer's sibling — dense,
scannable, unsentimental. The editor surface, including the metadata widget, should
feel calmer and slower than the rest of the app. The transition between them is the
whole design.

## Three candidate directions

Each is a direction, not a mockup. Exactly one should be carried into the wireframe
set; the others should be recorded as rejected with the reason.

### Direction A — "Quiet Instrument"

The journal is a precision instrument that happens to hold personal content. The
popout is visually identical in weight to the file explorer: same row height, same
type scale, same restraint. The only journal-specific move is **typographic**, not
chromatic — dates set in the interface sans at a slightly heavier weight, first-line
previews in the muted foreground at a smaller size, generating a natural two-tier
rhythm that reads as a list of *days* rather than a list of *files*.

- **Metadata widget:** collapsed (D24) to a single line that reads as a status
  strip, not a form. Expanded, it is a plain labeled grid with no decorative color.
- **Calendar:** a dense grid. Dots in the accent color, everything else in border
  and muted tones. Reads closer to a Git contribution graph than a wall calendar.
- **Emotional register:** deliberately none. The content supplies the feeling; the
  interface stays out of the way.
- **Risk:** may feel cold enough that journaling in it never becomes a habit. Also
  the least differentiated — a user may not register the journal as a distinct
  feature at all.

### Direction B — "Page in a Workshop"

The chrome stays tool-like, but the **editor surface is treated as a page**: a
measured column, generous line height, and a clear left edge that the metadata
widget aligns to. The metadata widget becomes part of the page's masthead — think
the dateline of a letter rather than a settings form. The popout is unchanged from
Direction A.

- **Metadata widget:** collapsed to a dateline-like line ("Wed, Aug 5 · good · 7"),
  which doubles as the summary affordance that analyst note 30 says is required.
  Expanded, it stays inside the page column so it never feels bolted on.
- **Calendar:** month view gets a little more air than Direction A — cells tall
  enough to read as days rather than data points, while still fitting a month
  without scrolling.
- **Emotional register:** warmth from **space and typography only**, never from new
  color. This is the cheapest kind of warmth to build and the hardest to get wrong.
- **Risk:** the measured column fights a narrow window; needs a defined behavior
  below some width. Also risks inconsistency with other editor surfaces, which are
  full-bleed.

### Direction C — "Data Journal"

Lean into the metadata. The journal's distinguishing feature is that it *quantifies*
days, so the interface foregrounds that: the popout list shows small metadata
indicators inline on each row, the calendar defaults toward metadata visualization,
and the collapsed widget reads as a compact data summary.

- **Metadata widget:** collapsed but always showing values as small chips.
- **Calendar:** built for the eventual mood/activity encodings rather than the
  dot-only first release (D29), so the dot phase looks like a stub of something
  larger.
- **Emotional register:** analytical. Appeals to quantified-self users.
- **Risk:** **conflicts with confirmed decisions.** D4 makes the vocabulary
  user-defined, so the app cannot know that "good" outranks "okay" or which color a
  value deserves — any encoding richer than presence/absence needs user-supplied
  meaning that does not exist yet. D29 also fixes the first release at dots. This
  direction would have the interface promising a capability the data model cannot
  yet support. Recorded for completeness; recommending against.

## Decision — approved

**Direction B, with Direction A's popout — approved by the product owner 2026-08-07 (D35).**
Direction A and Direction C are rejected; see D35 for the reasons.

Original recommendation, retained for the record:

**Direction B, with Direction A's popout.** The split is the point: A's discipline
is correct for a list that must survive ten years of entries, and B's page treatment
is where the emotional register belongs — in the surface the user actually writes on.
B's collapsed dateline also happens to solve the summary problem D24 created, which
is a genuine argument rather than a stylistic preference.

Direction C should be rejected now and revisited only if the metadata model later
gains user-supplied value ordering and color meaning.

## Explicit non-goals for this artifact

- No new color tokens, no journal-specific palette, no new icon family.
- No mood-color mapping, no emoji vocabulary, no illustration, no imagery. D4 makes
  the vocabulary user-defined; any built-in visual meaning would contradict it.
- No paper textures, no skeuomorphic notebook framing, no handwriting typefaces.
  The app is a Markdown workspace, not a diary simulator.
- No decision on type scale, spacing values, or component structure — that is the
  wireframe artifact's job.
- No claim about mood tracking as wellness or therapy; the epic's non-goals forbid
  medical or mental-health framing, and the visual direction must not imply it.

## Reference points

Named for register, not for copying:

- **VS Code / shell chrome** — the popout's density target.
- **Obsidian daily notes** — the closest analogue for "ordinary files, organized by
  date", including its weaknesses: date-named files with no visible sense of *when*
  in a long list.
- **iA Writer** — the measured writing column, and the discipline of adding warmth
  through space rather than ornament.
- **Git contribution graphs** — the honest version of dot-only density, and a
  caution: it reads as productivity scoring, which a journal must not.

## Open questions this artifact raises

- Direction B's measured column needs a defined behavior at narrow widths and on
  mobile, where the editor is full width.
- If B's collapsed dateline shows values, it must degrade cleanly when an entry has
  no metadata at all — which D22 makes the common case.
- Whether the calendar's visual weight should match the popout (A) or the editor
  page (B), since it lives in a canvas tab and belongs to neither.

## Checkpoint

| Artifact version | Reviewer | Status | Follow-up |
|---|---|---|---|
| Moodboard v1 (this file) | product owner | ✅ approved 2026-08-07 | Narrow-width / mobile behavior of the measured column |
| Undated-file treatment comparison | product owner | ✅ approved 2026-08-07 | Pinned group header chosen (D36) |
