# Story: Explorer first-line preview

App-scoped setting to show a file's first prose line beneath its name in the
workspace explorer. Must lazy-load: vaults may hold ~1000 notes flat or nested
(typically a few dozen), so only rows on/near screen may read files.

## Decisions (made with owner)

- **Look** (owner picked mockup A): a second, dimmed line under the filename,
  aligned with the name text, single-line truncated. Rows without a preview
  stay single-height.

  ```text
  ▾ 📁 projects
      📄 meeting-notes.md
         Agenda for Tuesday sync
      📄 ideas.md
         Half-formed thoughts on…
    📄 README.md
       ThinkBrain Notes workspace
  ```

- **Setting**: new `ui.explorer` section in the `ui` settings module
  (`packages/core/src/settings/modules/ui.ts`), boolean `showFirstLine`,
  default **off**, label "Show first line under file names". App scope, one
  toggle for desktop and phone.

- **Preview text**: first non-empty prose line with frontmatter stripped and
  whitespace collapsed — `previewText` in `shell/phone/tabPreview.ts` already
  does exactly this; hoist it somewhere shared (`src/lib/` or core) rather
  than adding a third copy (journalService inlines the same regex).

- **Which files**: Markdown and other text/code files. Media/binary viewer
  kinds and folders show name only.

- **Lazy loading**: the tree is not virtualized, so gate fetches on viewport
  visibility (an IntersectionObserver per row, or equivalent), not on folder
  expansion. Follow the journal pattern: `JournalPanelContainer` fetches only
  the reported visible window, batches at concurrency 8, caches per listing,
  stores `null` for empty/failed reads so scroll-bys don't refetch, and drops
  one path's cached preview on `note.saved`.

## Acceptance

- [ ] `ui` module gains an `ui.explorer` section with `showFirstLine` boolean,
      app scope, default off.
- [ ] Setting on → text-file rows draw the first-line preview on a dimmed
      second line under the name; off → today's rendering unchanged. Same
      behavior in the phone drawer explorer.
- [ ] Rows render immediately; previews fill in as reads complete without
      shifting or re-laying-out already-drawn names.
- [ ] Only visible/near-viewport rows trigger reads — expanding a folder of
      1000 notes does not issue ~1000 file reads (assert via a call-count test
      like `JournalPanelContainer.test.tsx`'s).
- [ ] Preview = first non-empty line after frontmatter, whitespace collapsed,
      single-line ellipsis; files with none show no second line.
- [ ] Media/binary files never fetch a preview.
- [ ] Cached previews invalidate per-path on save/external change; a re-listed
      workspace resets the cache.
- [ ] Unit + explorer coverage for the above; `pnpm qa` green.

Relevant seams: `workspace/WorkspaceTree.tsx` (row markup — second line lives
inside/under the name `button`), `workspace/WorkspaceExplorer.tsx`,
`workspace/workspaceExplorerModel.ts` (visible-entry reporting hook point),
`journal/JournalPanelContainer.tsx` + `journal/journalService.ts`
(`readPreview`, batching, cache/invalidate pattern to mirror),
`shell/phone/tabPreview.ts` (`previewText` to hoist).
