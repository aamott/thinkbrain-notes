# Notes

A note is a Markdown document.

Metadata uses YAML frontmatter.

---

Schema

The metadata schema strictly separates user-managed fields from app-managed fields.

User-managed fields:
title
tags
aliases
status

App-managed fields (automatically updated by the indexer/editor):
created
updated
created_at
updated_at

---

# Tasks

Tasks are purely represented as Markdown checkboxes.

Example:
- [ ] Implement UI
- [x] Write tests

There is no special "Task Object" or separate task database. This ensures 100% data portability. Tasks are indexed directly from the Markdown content.

---

Body

Markdown only.

No proprietary formatting.

Everything remains readable in any editor.

---

Attachments

Stored beside notes.

Referenced using relative paths.