# Extensions Epic — Completed Work

## IPC Surface Is Not the Contract — `ipc_surface_is_not_the_contract`

Settled 2026-08-28: Tauri command names are externally callable and their
existence is not the extension contract — the documented API surface is.
Unused `rename_markdown_file`/`delete_markdown_file` commands were deleted once
no caller remained; the platform may prune dead IPC without a deprecation
window.

Many earlier stories were reviewed and deleted per the plan-review policy:
manifest parser/schema, soft capability gating, local-directory loader +
persistence, lifecycle/bootstrap integration, contributed tab kinds,
workspace/tab APIs, D44 editor-header contribution. Their state is recorded in
the epic's Status section.
