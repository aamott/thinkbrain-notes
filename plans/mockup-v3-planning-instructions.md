# Mockup v3 → Production UI: Planning Instructions

> **Purpose:** Give a senior dev agent everything needed to write an
> implementation plan for adopting `mockup_v3/` as the official desktop UI —
> without reading the entire codebase first. Read this file, then follow the
> planning workflow in `.agents/AGENTS.md`.

## What exists today

### The mockup (`mockup_v3/`)

A standalone Vite + React + Tailwind v4 app (~1,900 lines) that demonstrates the
target UI. It is **reference only** — not a dependency, not imported by the real
app. It uses Tailwind v4 and inline `style` CSS variables, which **violate**
production styling rules (CSS Modules, no inline styles). The mockup must be
translated, not copy-pasted.

```
mockup_v3/src/
  App.tsx                  — shell orchestrator: state, CSS-var width driving, shortcuts
  main.tsx                 — entry, wraps App in ThemeProvider
  index.css                — Tailwind v4 @theme inline tokens (light + dark)
  lib/utils.ts             — cn() class merge helper
  data/mockData.ts         — all mock data + type definitions (FileNode, Tab, views)
  components/
    ActionBar.tsx          — left vertical icon bar (5 views + AI/settings)
    TitleBar.tsx           — app icon, tabs, right-action menu, theme toggle, window controls
    LeftPopout.tsx         — explorer tree, search, git, tags, extensions panels
    RightPopout.tsx        — outline, backlinks, properties, AI assistant panels
    EditorArea.tsx         — breadcrumbs + 4 tab content types (editor, browser, graph, preview)
    BottomPanel.tsx        — terminal, problems, output, backlinks-preview (toggleable)
    StatusBar.tsx          — git branch, errors/warnings, indexer, position, language
    CommandPalette.tsx     — Ctrl+P overlay with command + file search
    ResizeHandle.tsx       — draggable divider for left/right popouts
    theme-provider.tsx     — dark/light toggle, localStorage persistence
```

### The real app (`apps/desktop/`)

The current production app has a **basic shell** — a CSS grid layout
(`styles.css` `.app-shell`) with title bar, activity bar (text buttons, not
icons), sidebar (explorer/search/settings), editor area, right-panel placeholder,
and status bar. It works but is visually primitive compared to the mockup.

Key existing files the plan must address:

| File | What it does | What changes |
|------|-------------|--------------|
| `apps/desktop/src/App.tsx` | Shell layout, boot checks, panel switching | Replaced with mockup_v3-style shell |
| `apps/desktop/src/styles.css` | Grid layout, all component styles (621 lines) | Replaced by CSS Modules per component |
| `apps/desktop/src/stores/appStore.ts` | Zustand store (workspace, document, settings, indexing, search) | Extended with tab/layout/sidebar-width state |
| `apps/desktop/src/workspace/WorkspaceExplorer.tsx` | File tree (react-arborist) | Wired into new LeftPopout explorer panel |
| `apps/desktop/src/search/SearchPanel.tsx` | Search UI | Wired into new LeftPopout search panel |
| `apps/desktop/src/settings/SettingsPanel.tsx` | Settings form | Wired into new LeftPopout or dedicated tab |
| `apps/desktop/src/editor/MarkdownEditor.tsx` | CodeMirror 6 editor | Becomes one tab content type in EditorArea |
| `apps/desktop/src/native/commands.ts` | Tauri IPC bridge | Unchanged — UI calls through this |

### Shared packages

| Package | Role | Notes |
|---------|------|-------|
| `packages/core` | Platform-agnostic logic, types, interfaces | No React/DOM deps. Layout types go here. |
| `packages/ui` | React DOM components + design tokens | `Button.tsx` exists. Tokens in `styles/tokens.css`. |

Current tokens use `--tn-color-*` prefix. The mockup uses a richer token set
(`--color-titlebar`, `--color-activitybar`, `--color-sidebar`, `--color-editor`,
`--color-panel`, `--color-statusbar`, `--color-tab-*`). The plan must reconcile
these — extend `packages/ui` tokens, not create a parallel system.

## What the plan must produce

The planning agent should create/update these per the AGENTS.md planning system:

1. **Update `plans/ui-shell.md`** — the existing epic. Its Status section
   already tracks the basic shell as done and has pending stories for movable
   actions, layout slots, command palette, sidebar minimize. The mockup_v3
   adoption supersedes some of these and adds new ones. Reconcile the Status
   section.

2. **Update `plans/ai.md`** — the AI epic stub. The mockup's right-panel AI
   assistant and the Vercel AI SDK + assistant-ui + ACP requirements change the
   architecture decisions. Update the epic to reflect the chosen stack.

3. **Create story files** in `plans/ui-shell/` and `plans/ai/` following the
   naming convention: `<status>-<description>-<urgency>-<difficulty>.md`.

4. **Update `plans/technical-decisions.md`** — add decisions for: Tailwind vs
   CSS Modules resolution, assistant-ui + Vercel AI SDK as the chat stack, ACP
   SDK as the agent transport.

## Architecture requirements

### Frontend loosely coupled from core

The hub-and-spoke rule is non-negotiable: `packages/core` has no React/DOM deps.
The UI layer in `apps/desktop` consumes core interfaces.

The plan must define **adapter interfaces** so the UI never imports core
implementation details directly:

```
packages/core/src/
  layout/
    types.ts           — ActionDef, SlotDef, LayoutConfig, TabKind, Tab
    actionRegistry.ts  — action definitions (platform-agnostic)
    slotRegistry.ts    — slot definitions
  ai/
    types.ts           — ChatMessage, ChatSession, ProviderConfig
    provider.ts        — interface for AI providers (local + remote)

apps/desktop/src/
  shell/               — new: TitleBar, ActionBar, StatusBar, ResizeHandle
  panels/              — new: LeftPopout panels, RightPopout panels, BottomPanel
  tabs/                — new: tab content registry (editor, browser, graph, preview)
  adapters/            — new: core interface → Tauri/React implementations
  stores/              — existing: appStore extended with layout/tab/sidebar state
```

### Styling: CSS Modules, not Tailwind

The mockup uses Tailwind v4. Production uses **CSS Modules** (`*.module.css`)
co-located with components, with shared tokens as CSS variables in
`packages/ui`. This is an AGENTS.md rule — no inline styles, no `<style>` in
JSX.

The plan must include a story for translating every mockup component's Tailwind
classes to CSS Modules. The token set from `mockup_v3/src/index.css` should be
merged into `packages/ui/src/styles/tokens.css` using the existing `--tn-*`
prefix convention.

### AI chat: Vercel AI SDK + assistant-ui

The mockup's `AssistantPanel` is a static mock. Production uses:

- **`@assistant-ui/react`** — chat UI primitives (Thread, message components,
  input). Provides `AssistantRuntimeProvider` and `Thread`.
- **`@assistant-ui/react-ai-sdk`** — bridges assistant-ui to the Vercel AI SDK.
  Provides `useChatRuntime({ api: "/api/chat" })` or `useAISDKRuntime(chat)`.
- **`ai` + `@ai-sdk/react`** — Vercel AI SDK. Provides `useChat()` hook with
  streaming, `DefaultChatTransport`, `UIMessage` types.

Integration pattern (from current docs):

```tsx
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
import { Thread } from "@/components/assistant-ui/thread";

function ChatPanel() {
  const runtime = useChatRuntime({ api: "/api/chat" });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread />
    </AssistantRuntimeProvider>
  );
}
```

The plan must address:
- Where the chat API endpoint lives (Tauri has no Next.js server; the transport
  must route through Tauri IPC or a local HTTP server — this is an architecture
  decision the plan needs to make)
- How the Vercel AI SDK transport is customized for a desktop app (no `/api/chat`
  route exists in Tauri; `DefaultChatTransport` expects a URL — a custom
  `ChatTransport` implementation or a local server is needed)
- assistant-ui theming to match the app's CSS variable tokens (not Tailwind)
- Message persistence (chat history stored in OS app-data, never in the vault)

### Agent: Agent Client Protocol (ACP)

The app acts as an ACP **host**. Read `.agents/skills/acp/SKILL.md` before
planning ACP stories. Key rules:

- The host exposes capabilities (filesystem, terminal, permissions). It never
  duplicates agent reasoning.
- Prefer official ACP SDKs over hand-rolled transport. Check
  https://github.com/zed-industries/agent-client-protocol for SDKs.
- Permission model: agent requests → host shows UI → user decides (allow once /
  always / deny) → host enforces.
- The host stays deterministic.

The plan must address:
- Which ACP SDK package to use (or whether to implement transport manually if no
  TypeScript SDK exists)
- How ACP sessions map to the chat UI (is each chat session an ACP session?)
- How ACP capabilities bridge to the existing Tauri native commands
- How ACP permission prompts surface in the UI (modal? inline? status bar?)
- The relationship between the Vercel AI SDK (chat streaming/UI) and ACP (agent
  communication). These are two different layers — the plan must clarify whether
  they coexist, or whether ACP replaces the AI SDK for agent-driven chat.

### Tabs as pluggable content types

The mockup's key feature: tabs in the title bar can host any content type. The
plan must define a **tab content registry** — a mapping from `TabKind` to a
React component, with a default set:

| TabKind | Component | Notes |
|---------|-----------|-------|
| `editor` | `MarkdownEditor` (existing CodeMirror 6) | Already implemented |
| `browser` | `BrowserView` | Tauri webview or iframe; needs Tauri-specific impl |
| `graph` | `GraphView` | Depends on `graph` epic; stub for now |
| `preview` | `PreviewView` | Rendered Markdown preview |
| `settings` | `SettingsView` | Existing settings panel as a tab |

The registry should be extensible so future epics (extensions, canvas) can
register new tab types.

### Resizable panels

The mockup uses CSS variables (`--sidebar-w`, `--right-sidebar-w`) driven from
React state, with a `ResizeHandle` component using window-level pointer events.
The production version should:

- Store widths in the Zustand layout store
- Persist to OS app-data (never in the vault)
- Use CSS Modules instead of inline `style` props (the width CSS vars can be set
  via a CSS class on the root element or a `data-*` attribute + CSS, or a single
  inline-style exception documented and approved)

**Note:** The no-inline-styles rule may need a documented exception for CSS
custom property values that are dynamic (panel widths). The plan should flag this
to the user as a decision point.

## Suggested story breakdown

The planning agent should treat these as starting suggestions, not a fixed list.
Adjust urgency/difficulty based on investigation.

### ui-shell epic stories

| Story | Urgency | Difficulty | Notes |
|-------|---------|------------|-------|
| Token migration: merge mockup_v3 tokens into `packages/ui` | high | med | Reconcile `--tn-*` with mockup's richer set |
| Shell layout: TitleBar + ActionBar + StatusBar | high | med | CSS Modules, replace current grid shell |
| Tab system: tab model, tab strip, content registry | high | hard | TabKind → component mapping, dirty state, close |
| Left popout: explorer panel (wire existing WorkspaceExplorer) | high | med | Replace mock tree with react-arborist |
| Left popout: search panel (wire existing SearchPanel) | high | easy | Adapt existing component to new shell |
| Left popout: git/tags/extensions panels | med | med | Git depends on git-integration epic |
| Right popout: outline/backlinks/properties panels | med | med | Backlinks depend on indexing-search |
| Right popout: AI assistant panel (assistant-ui) | med | hard | Depends on ai epic |
| Bottom panel: terminal/problems/output | low | med | Terminal depends on ACP |
| Command palette | med | med | Ctrl+P, command + file search |
| Resizable panels + width persistence | med | med | CSS var approach, Zustand, OS app-data |
| Theme toggle (dark/light) | high | easy | Already have theme tokens; wire the toggle |

### ai epic stories (update existing stubs)

| Story | Urgency | Difficulty | Notes |
|-------|---------|------------|-------|
| ACP SDK selection + transport layer | med | hard | Evaluate official SDKs vs manual impl |
| Vercel AI SDK integration (transport for desktop) | med | hard | No `/api/chat` in Tauri; custom transport |
| assistant-ui chat panel | med | med | Wire into right popout, theme with CSS vars |
| ACP host: session lifecycle + capabilities | med | hard | Filesystem, terminal via Tauri commands |
| ACP permission UI prompts | med | med | Modal or inline; allow once/always/deny |
| Model/provider configuration | low | med | Settings UI for provider selection + keys |

## Decisions the plan must flag to the user

These are architectural choices the planning agent should not make unilaterally:

1. **Tailwind vs CSS Modules** — The mockup uses Tailwind v4. AGENTS.md mandates
   CSS Modules. Confirm: translate all Tailwind to CSS Modules (recommended), or
   adopt Tailwind in production (requires changing AGENTS.md styling rules).

2. **Dynamic CSS variables and the inline-style rule** — Panel widths need
   runtime CSS variable values. Options: (a) documented inline-style exception
   for CSS custom properties only, (b) `data-*` attributes + CSS, (c) CSSOM
   manipulation via `useRef`. The plan should recommend one and flag it.

3. **Chat transport in a desktop app** — Vercel AI SDK expects an HTTP endpoint.
   Tauri has no built-in server. Options: (a) custom `ChatTransport`
   implementation that routes through Tauri IPC, (b) spawn a local HTTP server
   in Rust, (c) use ACP as the sole transport and skip the AI SDK's HTTP
   assumption. The plan should investigate and recommend.

4. **ACP vs Vercel AI SDK relationship** — Are these two separate layers (AI SDK
   for simple chat, ACP for agent interactions), or does ACP replace the AI SDK
   entirely? The mockup shows a simple chat panel, but the app vision mentions
   ACP agents. Clarify which path the right panel takes.

5. **Browser tab implementation** — The mockup fakes a browser with static HTML.
   In Tauri, options are: (a) Tauri's webview API, (b) `<iframe>` (limited by
   CSP/X-Frame-Options), (c) defer browser tabs entirely. The plan should
   recommend.

6. **Extensions panel scope** — The mockup shows an extensions panel with
   install buttons. The `extensions` epic is a future stub. Should the panel be
   a placeholder, or does this pull the extensions epic forward?

## Required reading for the planning agent

In order:

1. `.agents/AGENTS.md` — architecture rules, planning system, styling, linting
2. `plans/app-vision.md` — app vision, principles, stack, MVP scope
3. `plans/technical-decisions.md` — cross-cutting decisions
4. `plans/ui-shell.md` — existing UI shell epic (current status, pending stories)
5. `plans/ai.md` — AI epic stub (ACP, provider abstraction, chat panel)
6. `.agents/skills/acp/SKILL.md` — ACP responsibilities, host/agent boundary
7. This file (`plans/mockup-v3-planning-instructions.md`)

Then explore (read-only, targeted):
- `mockup_v3/src/App.tsx` — shell structure and state management
- `mockup_v3/src/components/` — each component's structure and props
- `mockup_v3/src/data/mockData.ts` — type definitions and mock data shapes
- `mockup_v3/src/index.css` — full token set (light + dark)
- `apps/desktop/src/App.tsx` — current production shell
- `apps/desktop/src/stores/appStore.ts` — existing Zustand store shape
- `apps/desktop/src/styles.css` — current styling approach
- `packages/ui/src/styles/tokens.css` — existing design tokens
- `packages/core/src/index.ts` — existing core types

Use the context7 MCP server to fetch current docs for `@assistant-ui/react`,
`@assistant-ui/react-ai-sdk`, `ai` (Vercel AI SDK), and `@ai-sdk/react` when
writing stories that reference them.

## Output

Produce:
1. Updated `plans/ui-shell.md` Status section (reconcile with mockup_v3 adoption)
2. Updated `plans/ai.md` (architecture decisions for AI SDK + assistant-ui + ACP)
3. Updated `plans/technical-decisions.md` (new cross-cutting decisions)
4. New/updated story files in `plans/ui-shell/` and `plans/ai/`
5. A summary of decisions that need user confirmation (the 6 items above, or
   others discovered during planning)
