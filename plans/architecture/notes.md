# Notes

## Goal

Define the portable Markdown note format used by the app.

## Source of Truth

A note is a normal Markdown file on disk.

The app must not require a database, proprietary format, or hidden sidecar file to preserve note content.

## Body Format

The note body is Markdown only.

Supported Markdown features may grow over time, but the file must remain readable in other Markdown editors.

## Frontmatter

Metadata uses YAML frontmatter.

Example:

```yaml
---
title: Example Note
tags:
  - project
aliases: []
status: draft
created_at: 2026-06-17T12:00:00Z
updated_at: 2026-06-17T12:30:00Z
---
```

## User-Managed Fields

Initial user-managed fields:

- `title`
- `tags`
- `aliases`
- `status`

Users may add arbitrary additional fields. The app must preserve unknown fields when editing frontmatter.

## App-Managed Fields

Initial app-managed fields:

- `created_at`
- `updated_at`

Do not also use `created` or `updated`; use one timestamp convention only.

## Mutation Policy

Opening, indexing, or searching a note must not rewrite the file.

The app should manage timestamps during explicit note creation/save operations:

- Set `created_at` when the app creates a new note and the field is missing.
- Set `updated_at` when the user explicitly saves a note through the app.
- Do not update timestamps during opening, indexing, or searching.
- Preserve unknown frontmatter fields.

## Tasks

Tasks are represented as Markdown checkboxes:

```md
- [ ] Implement UI
- [x] Write tests
```

There is no separate task database or proprietary task object in MVP.

## Links

Wiki links use Markdown text syntax compatible with Obsidian-style notes:

```md
[[Some Note]]
[[Some Note|Display Text]]
```

MVP may parse links for indexing. Graph UI is deferred.

## Attachments

Attachments are normal files referenced with relative paths.

MVP should avoid inventing a hidden attachment database.
