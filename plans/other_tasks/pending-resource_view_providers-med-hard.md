# Story: Resource/view providers for file-type handling

`docs/reviews/2026-10-10/architecture-core-extensions-editor-med-hard.md` #2.

File-type handling is hard-coded in a growing chain: core's closed
suffix→tab-kind table, `TabContent`'s render switch, `tabModel`'s
load-classification. Every new type (canvas, graph, PDF, more viewers)
edits all three. Extensions can register tabs but can't claim a file type,
choose text/binary loading, or join dirty/save.

Do this BEFORE canvas/graph/PDF lands, not after the switch grows further.

## Acceptance

- [ ] Ordered provider registry: match (suffix/MIME/content + priority),
      load strategy, editable/save capability, render factory, optional
      editor-command/header surfaces.
- [ ] Built-in Markdown, code, and media viewers register through the same
      path — no special cases left in `TabContent`.
- [ ] Core owns matching/descriptor types; desktop binds loading+render.
