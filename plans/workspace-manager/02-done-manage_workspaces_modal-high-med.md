# Story: Manage workspaces modal

Depends on: `known_workspaces_backend`

## Acceptance

- [ ] "Manage workspaces…" item in the switcher and on the welcome page.
- [ ] Modal lists known workspaces: name, path, Git badge, "This window",
      "Folder missing"; filter input; Open folder / Create (Android) / Import from Git.
- [ ] Remove from list (external) with Undo toast; Delete (managed) with
      type-the-name confirm; current workspace can't be removed or deleted.
- [ ] Full-screen on phone, 44px targets; keyboard + screen-reader friendly.
- [ ] Tests; `pnpm qa` clean.
