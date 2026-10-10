# Extensions

> Extension system: internal contribution points and trusted local modules.
> Low urgency; implementation in progress. Read `plans/app-vision.md` before
> starting any story. Beta favors maintainability and easy development over
> hostile-extension isolation; built-ins ship first.

## Goal

Make the app extensible without compromising local-first, privacy-first, and
"files stay plain Markdown". Internal contribution points first, then a
manifest format, trusted same-context module loading, and lifecycle
management. Third-party extension safety is not the beta goal.

Driving use cases — Git sync, ACP Agent Chat, journal/calendar — shape the
capability declarations, event types, and API surface; the system must serve
them without special-casing.

## Scope

- Internal contribution points shared by built-ins and future extensions:
  commands, panels, editor hooks, settings schema, contributed tab kinds.
- Execution model: trusted same-context JS modules in the webview — no
  iframe/process isolation in beta. Capabilities are soft, manifest-declared
  compatibility gates and documentation, never a security sandbox.
- `extension.json` manifest: kebab-case ids, `apiVersion` (`*`, exact
  `x.y.z`, `^x.y.z`, `~x.y.z` only), activation events (`onStartup`,
  `onCommand:<id>`, `onView:<id>`; `onLanguage` warns, unsupported), soft
  capabilities, platform requirements (desktop-only `terminal`/
  `process-spawn` warn on mobile).
- Lazy activation; every activation owns a disposable scope that cleans up
  registrations, subscriptions, timers, watchers, and tasks on deactivate,
  unload, or failure.
- Namespaced app/workspace settings through the shared JSON registry outside
  the vault (D45); secrets via Rust/native OS credential adapters — never
  JSON, never bulk/cross-extension reads; encrypted fallback undecided.
- Install-from-file later with an explicit app-privileges warning.
- API surface split across focused stories: contribution surfaces,
  events/tasks, data storage, feature hooks, settings, secret storage,
  packaging, file installation, built-in registrations.

Non-goals: install-from-URL, signing, marketplace/discovery, hostile
isolation, remote hosting, extension-to-extension direct communication.

## Architecture

- Hub-and-spoke: runtime and contribution points in `packages/core`; platform
  adapters in `apps/desktop`. Mobile is the same webview — no `apps/mobile/`.
- `desktopTabRegistry` is an app-wide singleton; a contributed kind must
  bring its own `factory` (built-in kinds stay shell-drawn — the editor needs
  state `DesktopTabContext` doesn't carry). `context.tabs.open(kind, title)`
  opens one.
- D47 reserves built-in ids `journal-calendar`, `git`, `agent-chat`; relative
  ids are host-prefixed `${extensionId}.${id}`.
- This epic owns only the extension boundary and registrations; feature
  behavior stays in `plans/auto-sync/`, `plans/ai/` (awaiting its planning
  pass), and journal-calendar. `marketplace` is a future consumer.

## Status

Shipped stories are summarized in `plans/extensions/done-summary.md`.

- ✅ Internal contribution points, contributed tab kinds, manifest parser,
  compatibility gating, local-directory loader + persistence,
  lifecycle/bootstrap, workspace/tab APIs (D68/D69), D44 editor-header slot —
  story files deleted per the plan-review policy.
- 🟨 `extension_contribution_surfaces` — panel mount contract + header
  actions shipped; menus, context menus, themes, editor actions remain.
- 🟨 `extension_events_tasks` — app-event subscriptions shipped; custom
  events and background tasks remain.
- 🟨 `extension_settings` — scoped runtime shipped (D45); settings UI,
  cleanup, uninstall remain.
- 🟨 `beta_builtin_extensions` — `journal-calendar` + `note-stats`
  registered; Git and ACP boundaries await owner approval.
- ⬜ `extension_data_storage`, `extension_feature_hooks`,
  `extension_packaging_format`, `extension_file_installation`,
  `extension_secret_storage` (keyring v4 direction drafted; encrypted
  fallback undecided).
- 🚫 `extension_deferred_distribution` — URL/marketplace/signing explicitly
  deferred; do not implement in beta.
