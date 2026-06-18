# Editor

## Decision

Use CodeMirror 6 directly for the Markdown editor.

Reasons:

- lightweight
- extensible
- strong Markdown support
- mature ecosystem
- better fit than Monaco for a Markdown-first notes app

## MVP Scope

The MVP editor should support:

- opening a Markdown file
- editing Markdown text
- saving back to disk as plain Markdown
- syntax highlighting
- dirty-state tracking
- basic keyboard shortcuts
- undo/redo through CodeMirror
- integration with active document state

## Near-Future Features

These are useful, but should be added after the basic editor is stable:

- clickable wiki links
- clickable tags
- task checkbox toggling
- image rendering in editor flow
- frontmatter folding or visual separation
- split preview or live preview
- find/replace

## Deferred Rich Markdown Features

Do not implement in the first editor slice unless specifically assigned:

- Mermaid rendering
- math rendering
- callout rendering
- advanced table editing
- AI editing
- extension-provided editor plugins
- optional Monaco package

## Persistence Rule

The editor must preserve user Markdown. It should not rewrite unrelated frontmatter, formatting, or content during normal edits.
