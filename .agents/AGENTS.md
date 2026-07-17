# Project Guidance

## Architecture

- Stack: React + TypeScript + Vite, Zustand, Tauri/Rust desktop, Expo mobile (Phase 2), and CodeMirror 6.
- Markdown files and Markdown checkboxes (`- [ ]`) are the source of truth. SQLite + FTS5 is a disposable index cache only.
- Keep the vault limited to Markdown and attachments. Settings, credentials, indexes, caches, layout, and chat history belong in OS app-data, never in the vault.
- The app is local-first: no telemetry, proprietary cloud backend, or vendor lock-in. Remote AI is opt-in and requires explicit consent before note content leaves the device.
- `packages/core` is platform-agnostic: no React, DOM, Node, Tauri, or concrete provider dependencies. Apps implement its interfaces through adapters.
- Keep Tauri commands and Rust capability enforcement behind desktop adapters; UI components must not call native implementations directly.
- Extensions use a capability-based sandbox. Never grant an extension or agent unrestricted filesystem access.

## Plans

- Read `plans/app-vision.md`, the relevant epic, and its pending/wip stories before major work. Only change the vision when explicitly asked.
- Epics live at `plans/<epic>.md`; stories live in `plans/<epic>/` and are named `<status>-<description>-<urgency>-<difficulty>.md` using underscores in descriptions.
- Each story needs a short goal, acceptance criteria, and file references. Rename stories as their status changes; delete superseded or obsolete stories.
- Keep each epic's `Status` section accurate with `✅ done`, `🔄 wip`, `⬜ pending`, or `❌ blocked`. Record discovered inconsistencies there rather than silently planning around them.

## UI and Styling

- Production desktop UI uses co-located CSS Modules (`*.module.css`) and the `--tn-*` semantic token system in `packages/ui`. Tailwind is permitted only in isolated mockups/reference apps; never copy its classes into production.
- No JSX inline styles or `<style>` blocks. For a runtime CSS custom property, update a scoped element via CSSOM (`ref.current.style.setProperty`) and keep the property and its fallback in the component's CSS Module.
- Use semantic HTML, keyboard support, visible focus states, and responsive layouts. Use `data-thinkbrain-theme` / CSS variables for themes; do not branch visual theme behavior in JavaScript.
- Promote repeated values to tokens or component variants. Keep third-party style overrides narrow and co-located with the integrating component.

## AI and ACP

- Desktop chat UI uses `@assistant-ui/react` with the Vercel AI SDK UI layer (`ai`, `@ai-sdk/react`, and `@assistant-ui/react-ai-sdk`). Its Tauri IPC transport is an adapter, not a `/api/chat` assumption.
- ACP is a separate host-to-agent protocol. Prefer official ACP SDKs; the host is deterministic, exposes capabilities and permissions, and never copies an agent's reasoning, planning, or editing logic.
- AI SDK chat sessions and ACP agent sessions have explicit, persisted IDs and lifecycle boundaries. Do not store either in the vault or use Assistant Cloud by default.

## Quality

- Run the narrowest relevant checks after non-trivial changes, then `pnpm lint`, `pnpm typecheck`, and targeted tests when the change is ready. Do not fix unrelated failures; record them in the relevant epic instead.
- Avoid `any`; use `unknown`, generics, or a documented narrow exception.
- Treat `eslint.config.*` changes and new privileged native capabilities as architectural decisions: document and surface them before implementation.
