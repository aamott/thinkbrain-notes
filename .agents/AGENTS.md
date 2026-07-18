# Project Guidance

## Architecture

- Stack: React + TypeScript + Vite, Zustand, Tauri/Rust desktop, Expo mobile (Phase 2), and CodeMirror 6.
- Editor-specific data defaults to being stored outside of the vault to keep it clean. 
- Local first
- Cross platform: `packages/core` is platform-agnostic: no React, DOM, Node, Tauri, or concrete provider dependencies. Apps implement its interfaces through adapters.
- Keep Tauri commands and Rust capability enforcement behind desktop adapters; UI components must not call native implementations directly.
- Extensions use a capability-based sandbox for maximum security, permissions granted per extension.

## Plans
List relevant folder to see task status. Review after milestones. Delete task files after review. Add action items from review as stories unless they are immediately fixable. 

**Folder hierarchy**
```
docs/plans/
├── Blueprint.md  # summary of the app. Ignore for now - needs updating. 
├── status-epic-difficulty.md
├── epic/
│   └── status-story-difficulty.md
└── other_tasks/ # bugs, chores, etc.
    └── status-task-difficulty-urgency.md
```


## UI and Styling

- Desktop UI uses Tailwind CSS v4 (`@tailwindcss/vite`). Semantic tokens (`--tn-*`) are defined in `packages/ui/src/styles/tokens.css` and mapped into Tailwind utilities via `@theme inline` in `apps/desktop/src/index.css`.
- Use Tailwind utility classes in JSX; merge conditional classes with `cn()` (`@/lib/utils`).
- CSS Modules (`*.module.css`) are legacy and being replaced. Do not mix Tailwind and CSS Modules in the same component.
- Theme via the `data-thinkbrain-theme` attribute and CSS variables only; never branch visual theme behavior in JavaScript.
- Use semantic HTML, keyboard support, visible focus states, and responsive layouts.
- Promote repeated values to tokens or component variants. Keep third-party style overrides narrow and co-located with the integrating component.

## AI and ACP

- Desktop chat UI uses `@assistant-ui/react` with the Vercel AI SDK UI layer (`ai`, `@ai-sdk/react`, and `@assistant-ui/react-ai-sdk`). Its Tauri IPC transport is an adapter, not a `/api/chat` assumption.
- ACP is a separate host-to-agent protocol. Prefer official ACP SDKs; the host is deterministic, exposes capabilities and permissions, and never copies an agent's reasoning, planning, or editing logic.
- AI SDK chat sessions and ACP agent sessions have explicit, persisted IDs and lifecycle boundaries. Do not store either in the vault or use Assistant Cloud by default.

## Quality

- Run tests, `pnpm lint`, `pnpm typecheck`, and targeted tests when the change is ready. Report unrelated failures or bugs rather than getting off track. 
- Avoid `any`; use `unknown`, generics, or a documented narrow exception.
- Treat `eslint.config.*` changes and new privileged native capabilities as architectural decisions: document and surface them before implementation.