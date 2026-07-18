# Left Popout Integration

## Goal

Move existing workspace, search, and settings features into the mockup-v3 left
popout without replacing live data with mock trees or results.

## Acceptance Criteria

- [ ] Explorer hosts `WorkspaceExplorer`/react-arborist; selecting Markdown
      files opens the editor tab and non-Markdown behavior is unchanged.
- [ ] Search hosts `SearchPanel`, maintains indexing/error states, and opens
      matched files through the tab model.
- [ ] Settings opens in its registered settings tab; the left-panel action can
      focus that tab rather than duplicating the settings form.
- [ ] Git, tags, and extensions show correctly labeled unavailable/loading
      states until their owning epics expose their data and actions.
- [ ] Selecting the active activity item toggles the popout; shortcuts and
      aria-current state remain correct.

## References

- `mockup_v3/src/components/LeftPopout.tsx`
- `apps/desktop/src/{workspace,search,settings}/`
- `plans/pending-git-integration-high-hard.md`
- `plans/pending-extensions-low-hard.md`
