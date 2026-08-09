# Story: Hide Frontmatter in Live Preview

**Status:** pending · **Urgency:** med · **Difficulty:** easy

## Why

On a journal entry the metadata now appears twice: once as the dateline widget, which reads
`Friday, August 8, 2026 · happy`, and again as the raw block at the top of the note:

```
---
date: 2026-08-08
mood: happy
---
```

The raw block is noise on a page whose whole point is what you wrote. Asked for 2026-08-08.

## The question this needs answered first

**Every note, or only journal entries?** Frontmatter belongs to all notes, not just the
journal, and the live-preview module is shared. Three options:

1. **Hide in every note** when live preview is on. Simplest, consistent, and matches what
   live preview already does with syntax everywhere else — it hides `#` and `**` too.
2. **Hide only where an editor header is showing the same data.** Precise, but makes the
   editor's appearance depend on which extension happens to be active, which is hard to
   explain and harder to predict.
3. **A setting.** Costs a setting for something most people will decide once.

Recommendation: **1**, with reveal-on-cursor. Live preview's existing bargain is that source
appears when the cursor enters it; frontmatter should keep that bargain rather than become a
special case. Someone who wants to see raw frontmatter always has the raw editor with live
preview off.

## Scope

- Collapse the frontmatter range in `apps/desktop/src/tabs/livePreview/decorate.ts`, which
  already locates it via `findFrontmatterRange` and currently styles it as a dimmed data block.
- Reveal it when the cursor is inside, reusing the existing mechanism in `reveal.ts`.
- Leave the document untouched: this is decoration only, never an edit.

Non-goals: no frontmatter editing UI (the journal's dateline owns that for entries), no new
setting unless the question above is answered that way, no change to what is written to disk.

## Acceptance criteria

- [ ] With live preview on, a note opens with no visible frontmatter block.
- [ ] Putting the cursor in the hidden range reveals it, as other live-preview source does.
- [ ] With live preview off, frontmatter renders exactly as it does today.
- [ ] A note whose frontmatter is malformed still shows it — hiding something the parser could
      not read would hide the evidence the user needs.
- [ ] The document is never modified; existing live-preview integrity tests still pass.

## Validation

`pnpm lint`, `pnpm typecheck`, `pnpm test`. Desktop: open a journal entry and confirm the
dateline is the only metadata on screen; click into the hidden range and confirm it reveals.
