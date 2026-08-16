# Changelog

Newest first. Versions follow [semver](https://semver.org), except that before
1.0 a minor bump may still change behaviour.

## 0.1.0 — unreleased

First release.

A local-first Markdown workspace: your notes stay ordinary `.md` files on disk,
and everything the app builds on top of them — the search index, the link graph,
the calendar — is a cache it can throw away and rebuild.

- **Editor** — CodeMirror with live preview, wiki-link autocomplete and
  navigation, vault-relative images. Writes refuse to overwrite a file that
  changed underneath them.
- **Explorer** — file tree with full CRUD, multi-window workspaces, and a native
  watcher that keeps the tree, the open tabs and the index in step with edits
  made outside the app.
- **Search** — full-text search over the vault or one folder, plus typed filters
  over frontmatter fields.
- **Journal and calendar** — dated entries as plain notes, filterable by what
  they record.
- **Themes and settings** — importable themes; searchable settings with
  validation, import/export and per-section reset.
- **Extensions** — load one from a local directory; it can contribute panels,
  editor headers and commands.
- **Updates** — the app checks once at launch and offers to install a newer
  version. Updates are signed, and only one signed by this project's key is
  accepted.

### Known limits

- **Binaries are not code-signed.** macOS and Windows will both warn that the
  developer is unidentified. This is separate from update signing above, which
  proves an update came from this project but says nothing to the OS.
- **Windows is untested.** The file watcher has been exercised by hand on Linux
  and macOS only; CI builds Linux alone.
- **Search results are capped** at 200 matches, and nothing says so when a query
  matches more.
- **Installing an update restarts the app** without checking for unsaved edits.
  Save before accepting one.
