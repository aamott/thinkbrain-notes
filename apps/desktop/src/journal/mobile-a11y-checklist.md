# Journal mobile accessibility checklist

A manual pass over the journal's own surfaces on a real device. Automated tests cover
structure — roles, names, focus order, the touch-minimum classes — but none of them can hear
VoiceOver, feel a 44px target, or watch the soft keyboard land on a field. That is what this
list is for.

Run it on **one iOS device with VoiceOver** and **one Android device with TalkBack** before
signing off a release that touched the journal. Record the date, the OS versions, and anything
that failed.

Scope is journal-owned only: the popout, the dateline, the metadata sheet, and the calendar
tab. Shell navigation — how the popout opens, the back affordance, the bottom nav — belongs to
`plans/mobile/pending-responsive_layout-low-med.md` and is checked there.

| | Device / OS | Tester | Date |
|---|---|---|---|
| iOS + VoiceOver | | | |
| Android + TalkBack | | | |

## 1. Names and roles

Every control has to say what it is and what it does without relying on the glyph it shows.
Several of these deliberately show a symbol and carry the words in the label.

- [ ] Popout actions announce as **New journal entry**, **Today**, **Open journal calendar** — not "plus", "clock", "grid".
- [ ] The search field announces as **Search entries**; when the index is unavailable it announces as disabled and the banner above it is reachable.
- [ ] **Filter** announces its active count ("Filter entries, 2 filters active") rather than only showing a badge.
- [ ] Each filter chip announces as **Remove filter: <name>**, so its purpose is clear out of context.
- [ ] A group header announces its label *and* its count ("2026, 14 entries") and its expanded/collapsed state.
- [ ] An entry row announces its date and time; where a preview is shown, it follows the date rather than replacing it.
- [ ] The list announces as a tree, and swiping through rows moves one row at a time.
- [ ] Calendar day cells announce the exact count ("Fri, 7, 8 journal entries") even where the cell shows only three dots and no `+N`.
- [ ] Calendar view controls announce as **Week** / **Month** and **Today**, though they display `W`, `M` and a glyph.
- [ ] Today's cell announces as the current date; a selected day announces as selected.

## 2. The metadata sheet (D78)

The sheet is the journal's only new mobile component and carries the most contract.

- [ ] Opening it announces a **dialog named for the entry's date** ("Friday, August 7").
- [ ] Focus lands inside the sheet, not on the note behind it.
- [ ] Swiping past the last control does not escape into the note underneath.
- [ ] Dismissing by **swipe down**, **scrim tap**, and **the system back gesture** all land back on the note.
- [ ] After any of those three, focus is on the dateline control that opened the sheet — not on the document top.
- [ ] A value chosen and then dismissed by swipe is still recorded: values save as they change, and `Done` only closes.
- [ ] Option pills and the number field are each at least 44px tall to a fingertip, including the last row.
- [ ] Nothing behind the scrim is reachable by swipe while the sheet is open.

## 3. The soft keyboard

- [ ] Focusing a text or number field raises the keyboard and the **sheet moves above it** — the field being typed into stays visible.
- [ ] Dismissing the keyboard returns the sheet to the bottom edge without leaving a gap.
- [ ] Rotating with the keyboard up leaves the field visible.
- [ ] On a device with a floating or split keyboard, the sheet is not left stranded behind it.
- [ ] With a hardware keyboard attached, `Esc` closes the sheet and `Tab` cycles within it.

## 4. Zoom and text scaling

The journal has no fixed-height text containers, so scaled text should reflow rather than clip.

- [ ] At the largest system text size, entry rows grow to two full lines rather than truncating the date.
- [ ] The dateline wraps rather than clipping the year.
- [ ] Filter chips wrap onto further lines and never become a horizontal scroller (D77).
- [ ] Sheet labels and their controls stay on the same row, or stack — neither overlaps.
- [ ] At 200% page zoom nothing in the popout is cut off horizontally.
- [ ] Calendar day numbers stay legible; the strip collapses rather than overflowing.

## 5. Touch targets

- [ ] Every popout control clears 44px under a fingertip, including chips and **Clear all**.
- [ ] List rows clear 44px and adjacent rows are not activated by a thumb press.
- [ ] Calendar cells are large enough to hit individually in month view on the narrowest supported phone.

## 6. States

Each state has to be reachable and readable, not only the happy path.

- [ ] **Loading** announces as busy rather than reading as an empty list.
- [ ] **No entries yet** reads as finished, not broken, and its actions are reachable.
- [ ] **Can't read the journal folder** names what happened and offers Retry.
- [ ] **No matches** names the filter count and offers to clear them.
- [ ] A frontmatter or date-mismatch notice on an entry announces as a status and never claims to have repaired anything.

## Known gaps

- The formal touch-target audit is deferred per **D31**; this list checks the journal's own
  controls but is not that audit.
- Metadata facets render in their unavailable state until the index carries frontmatter, so
  **Filter**'s announcements cannot be fully checked yet. Search itself is live: it is enabled
  once the index reports ready, so both the enabled and the disabled announcements are now
  checkable — open a workspace large enough to catch it mid-index if you want the latter.
- `Open folder…` and `Open settings` are omitted from the empty states until the extension API
  can invoke host commands; there is nothing to check there yet.
