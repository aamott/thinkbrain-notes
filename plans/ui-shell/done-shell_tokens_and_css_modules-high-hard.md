# Shell Tokens and CSS Modules

## Goal

Translate the mockup-v3 visual system into shared `--tn-*` semantic tokens and
co-located production CSS Modules without copying Tailwind classes or retaining
the desktop shell's global component stylesheet.

## Acceptance Criteria

- [x] `packages/ui/src/styles/tokens.css` defines light and dark chrome tokens
      for every mockup-v3 surface and tab state using the `--tn-*` prefix.
- [x] New shell, panel, tab, and command-palette components use CSS Modules;
      `apps/desktop/src/styles.css` contains only app base/reset and narrowly
      scoped third-party editor styling.
- [x] Existing explorer, search, settings, editor, focus, error, and disabled
      states retain their visual and keyboard behavior after migration.
- [x] No production JSX uses Tailwind utilities, `style`, or a `<style>` block.
- [x] Token/theme tests or visual coverage exercise both `data-thinkbrain-theme`
      values.

## References

- `mockup_v3/src/index.css`
- `packages/ui/src/styles/tokens.css`
- `apps/desktop/src/styles.css`
- `plans/technical-decisions.md` — UI Components and Themes
