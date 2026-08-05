# ThinkBrain Notes

A local-first, cross platform desktop and mobile knowledge workspace for Markdown notes. ThinkBrain keeps notes as normal files, with the desktop interface built using React, Tauri, and CodeMirror. Will include a desktop app, mobile app, and Mac/Windows/Linux support, extensions (including automatic git syncing and conflict resolution), and stores metadata separate from the repo to avoid syncing issues with OneDrive and SyncThing. 

Future extensions include: 
- ACP Agent Chat
- Git sync (manual and automatic)
- Automatic conflict resolution for
  - OneDrive
  - SyncThing
  - Other cloud drives?

## Getting started

### Requirements

- Node 22.23.1 or newer (`.nvmrc` is provided)
- pnpm 11.8.0
- Rust and the Linux dependencies required by Tauri/WebKitGTK

```bash
nvm use
corepack enable
pnpm install --frozen-lockfile
```

Run the browser-only development UI:

```bash
pnpm dev
```

Build and launch the regular desktop application:

```bash
pnpm desktop:run
```

`desktop:run` builds the frontend and then starts the native Tauri executable;
it does not provide live reload. The usual live-reload command is:

```bash
pnpm desktop:tauri dev
```

On Linux, Tauri CLI requires an inotify watcher even before it starts the app.
If that command reports `Too many open files`, the per-user inotify instance
limit is exhausted. Close watcher-heavy programs or ask an administrator to
raise `fs.inotify.max_user_instances`; this is a host setting, not an app
configuration. `pnpm desktop:run` remains the non-live-reload alternative.

### Build Tooling (Linux, optional)

Rust builds auto-enable `sccache`/`mold`/`clang` if installed (no setup). Suggested: `sudo apt install sccache mold clang`. See [AGENTS.md](AGENTS.md#build-tooling-linux-optional) for details.

## Validation

Run these before opening a change:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:rust
pnpm test:e2e
pnpm build
```

## Contributing

1. Read [the app vision](plans/app-vision.md), the relevant epic in `plans/`,
   and `.agents/AGENTS.md` before changing an area.
2. Keep Markdown files as the source of truth. Settings, indexes, credentials,
   layout, and chat history belong in OS app-data, never in a workspace.
3. Production desktop UI uses CSS Modules and shared `--tn-*` tokens. The
   `mockup_v3/` directory is a reference only; do not import or copy it into
   production.
4. Add or update the relevant epic story, implement with focused tests, and run
   the validation commands above. Do not suppress failures.

AI and ACP work is optional and remains behind explicit consent, provider, and
permission boundaries. See [plans/ai.md](plans/ai.md) for the current plan.
