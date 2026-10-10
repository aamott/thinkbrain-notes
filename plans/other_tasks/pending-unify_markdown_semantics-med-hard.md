# Story: One Markdown/frontmatter authority in core

`docs/reviews/2026-10-10/architecture-core-extensions-editor-med-hard.md` #4.

Frontmatter/Markdown semantics exist in at least four places that disagree
at edges: core `frontmatter.ts` (careful), core `markdown.ts` (regexes for
tags/links/tasks), the editor's `livePreview/frontmatterRange.ts` line
scanner + `MarkdownEditor`'s own regex, `journal/frontmatterEdit.ts` text
surgery — and `frontmatterGuard.ts` uses yet another block definition.
Index/search/backlinks/graph can disagree with live preview on BOMs, empty
blocks, closing fence at EOF.

## Acceptance

- [ ] Shared `locateFrontmatter` contract in core consumed by editor, guard,
      and journal edit (first slice — cheap, kills the drift triplet).
- [ ] Lossless frontmatter edit ops in core (preserve comments/order/EOL).
- [ ] Longer-term: syntax-aware Markdown analysis in core (tokenizer/AST)
      replacing regex note analysis — evaluate Lezer vs standalone.
