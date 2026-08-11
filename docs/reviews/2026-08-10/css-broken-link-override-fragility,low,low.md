- name: cm-link-broken relies on CSS source order to override cm-link-text underline
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/tabs/livePreview/theme.ts
- lines: 99-112
- description: |
    `links.ts` (line 96) applies the class string `"cm-link-text cm-link-broken"`
    (or `"cm-link-text cm-link-resolved"`). In `theme.ts`:
      - `.cm-link-text` (lines 99-103) sets `textDecoration: "underline"`.
      - `.cm-link-broken` (lines 108-112) sets `textDecoration: "line-through"`.

    Both selectors have identical specificity (single class), so the cascade
    is decided purely by source order. `.cm-link-broken` is declared after
    `.cm-link-text`, so broken links render as line-through and the underline
    is lost — which is the intended visual, but it is implicit and fragile: a
    future edit that reorders the rules, or a theme override that re-declares
    `.cm-link-text` later in the cascade, will silently make broken links
    render as underline + line-through (or just underline).

    `.cm-link-resolved` (lines 104-107) also re-declares
    `color: "var(--tn-color-primary)"` identically to `.cm-link-text`, which is
    redundant.

    Suggested fix:
      - Make the override explicit by not relying on order: either drop
        `textDecoration` from `.cm-link-text` and set it per-variant
        (`cm-link-resolved` → underline, `cm-link-broken` → line-through), or
        use `text-decoration-line: line-through` on `.cm-link-broken` together
        with `text-decoration-line: underline` so both lines render
        intentionally rather than one clobbering the other.
      - Remove the redundant `color` from `.cm-link-resolved`.
      - Add a one-line comment in `theme.ts` documenting the class pairing if
        the current structure is kept.
- verification: |
    `links.ts` line 96 builds `linkClass` as `"cm-link-text cm-link-resolved"`
    or `"cm-link-text cm-link-broken"`. `theme.ts` declares `.cm-link-text`
    (line 99), `.cm-link-resolved` (line 104), `.cm-link-broken` (line 108) in
    that order; both broken and text rules set the `textDecoration` shorthand
    with equal specificity, so source order decides.
