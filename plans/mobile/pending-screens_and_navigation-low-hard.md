# Mobile Screens and Navigation

## Goal

Build mobile-native screens and navigation (stack/tab) for the core workflows:
workspace selection, file browsing, note editing, and search. Do not force
desktop panel layouts onto phone screens — design for phone-first, touch
interaction.

## Acceptance Criteria

- [ ] Navigation shell (stack/tab) routes between workspace, explorer, editor,
      and search screens.
- [ ] Workspace selection / opening screen (document picker or app directory).
- [ ] File explorer screen showing the workspace tree (Markdown + folders).
- [ ] Note editor screen with Markdown editing.
- [ ] Search screen with debounced type-ahead and result snippets.
- [ ] Phone-first layouts; no desktop multi-panel assumptions.
- [ ] Uses `StyleSheet` (no inline styles), per the Styling rule in `AGENTS.md`.

## References

- `plans/pending-mobile-low-hard.md` — epic, Separate UI layer decision
- `plans/app-vision.md` — architecture, MVP scope (feature surface)
- `apps/desktop/src/App.tsx` — desktop feature surface reference (do not port
  layout directly)
- `.agents/AGENTS.md` — Styling rule (React Native: use `StyleSheet`)
