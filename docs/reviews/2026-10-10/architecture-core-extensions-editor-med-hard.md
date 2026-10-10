# Architecture review: core, extensions, editor (med/hard)

Scope: architecture and product decisions, not a repeat of the line-level extension audit from 2026-10-07. Read-only source review; recommendations are ranked by expected value.

## Summary — top 5

1. **Do not connect a remote marketplace to the current same-realm loader.** Trusted local JavaScript is a reasonable beta choice; fetched code needs an explicit isolation/trust architecture before registry work begins.
2. **Replace static extension-to-tab inference and `TabContent`'s kind switch with resource/view providers.** The current tab registry extends chrome tabs, not file handling; it will turn canvas, graph, and many file types into a growing central switch.
3. **Keep stub-driven laziness, but remove the fictitious activation-events protocol.** A declared contribution should be its activation trigger; declare every discoverable surface and avoid activating all extensions merely to discover settings.
4. **Make core the single semantic Markdown/frontmatter authority.** Core parsing is platform-neutral and widely consumed, but regex extraction and three editor/app scanners already disagree at document edges.
5. **Keep built-ins extension-shaped, but stop treating privileged built-ins as proof of the public API.** Journal reaches through to app stores/services that local extensions cannot access; either expose stable host services or label and isolate it as first-party privileged code.

Overall: `packages/core` is genuinely runtime-platform-neutral, and settings/registry reuse is strong. It is not yet the “hub and spoke” boundary described by the vision: several ports and pure domain decisions remain app-owned, while the extensibility seam stops before resource loading/rendering. The editor's CodeMirror lifecycle is sound for two text editors, but the surrounding file-view architecture is the scaling limit.

## Findings

| Rank | Title | Urgency | Difficulty | Payoff |
|---:|---|---|---|---|
| 1 | Gate marketplace on a real remote-code trust boundary | High | Hard | Very high |
| 2 | Introduce resource/view providers before adding more file types | High | Hard | Very high |
| 3 | Replace activation events with complete declarative contributions | Med | Med | High |
| 4 | Unify Markdown/frontmatter semantics in core | Med | Hard | High |
| 5 | Separate public extensions from privileged built-ins | Med | Hard | High |
| 6 | Make the core/adapters contract honest and enforceable | Med | Med | Med-high |
| 7 | Grow `packages/ui` by reusable primitives, not app composites | Low | Med | Medium |

## 1. Gate marketplace on a real remote-code trust boundary

**Current decision and evidence.** Local extensions are explicitly full-privilege trusted code (`packages/core/src/extensions/loader.ts:4-10`), read as text and imported into the renderer through a blob URL (`apps/desktop/src/extensions/desktopLocalDirectoryLoader.ts:27-46`). Capability declarations are soft hints (`packages/core/src/extensions/manifest.ts:43-47`). The marketplace plan correctly says stronger trust/isolation needs a new decision, but still sketches download URLs, signatures, and installation (`plans/pending-marketplace-low-med.md:37-68`; `plans/marketplace/pending-extension_registry-low-med.md:12-20`).

**Cost.** In the same realm, extension code can reach DOM, globals, network APIs, in-memory note contents, and any renderer-exposed Tauri surface regardless of declared capabilities. Signing establishes provenance/integrity, not safety. A static registry changes the threat model from “the user chose a local development directory” to scalable remote-code delivery; warning copy and consent do not close that gap.

**Alternative.** Keep same-realm loading for an explicitly labelled **trusted local/developer mode**. Before remote discovery/install, choose and prototype one of: (a) worker/process RPC for non-UI logic plus sandboxed iframe/webview panels; (b) a separate extension-host process with a versioned message API; or (c) a deliberately curated/trusted marketplace with no sandbox claim and a materially stronger publisher/review/revocation model. Prefer (a)/(b) if an open marketplace remains the goal. Tauri command exposure must be scoped to the extension context, not merely wrapped by TypeScript APIs.

**Effort/risk/payoff.** Hard, high migration and cross-platform risk (especially Android and UI contributions); very high payoff. Make this a prerequisite decision, not a signing-story detail. The current trusted-local beta should remain as-is meanwhile.

## 2. Introduce resource/view providers before adding more file types

**Current decision and evidence.** Core maps suffixes through a closed table and sends every unknown file to `code-editor` (`packages/core/src/layout/index.ts:117-143`). The desktop tab registry stores metadata/factories (`apps/desktop/src/tabs/tabRegistry.ts:25-50`), but built-ins have no factories and `TabContent` hard-codes browser, graph, preview, settings, merge, diff, code, and each media kind (`apps/desktop/src/shell/TabContent.tsx:127-260`). Extension factories receive only `rootPath` and `tabId` (`apps/desktop/src/tabs/tabRegistry.ts:9-15`), while document loading is separately hard-coded to `editor` and `code-editor` (`apps/desktop/src/tabs/tabModel.ts:35-49`).

**Cost.** Registering a tab does not let an extension claim `.pdf`, `.canvas`, or a MIME/content signature; request binary/text loading; participate in dirty/save/reload; or provide editor commands and headers. Every first-party file type therefore edits core inference, shell loading, persistence classification, and the central render switch. That conflicts with “everything replaceable” and makes canvas/graph/many viewers special cases.

**Alternative.** Add an ordered `ResourceViewProvider` registry with: stable id; filename/MIME/content match and priority; text/binary/custom load strategy; read-only/editable/save capabilities; renderer factory; optional command/header/editor-hook surfaces; and restoration metadata. Core should own platform-neutral descriptors and matching; desktop binds native loading and React rendering. Built-in Markdown, code, image/audio/video, canvas, and graph should register through the same provider path. Keep tabs as instances/navigation, not as the file-type resolver.

**Effort/risk/payoff.** Hard; medium-high migration risk because loading, dirty state, restore, and phone replacement rules meet here. Very high payoff: implement before canvas/PDF/graph rather than after the switch expands. A smaller “file-handler registry over the existing tab registry” is a safe first slice; a full microkernel rewrite is not warranted.

## 3. Replace activation events with complete declarative contributions

**Current decision and evidence.** `onCommand:` and `onView:` are parsed but intentionally ignored; stubs activate any declared command/panel, while only `onStartup` changes behavior (`packages/core/src/extensions/activation.ts:8-14,32-49`). This stub mechanism is coherent and preserves first-frame discoverability (`apps/desktop/src/extensions/bootstrap.ts:46-58,156-189`). However, manifests can declare only commands and panels (`packages/core/src/extensions/manifest.ts:16-34`), while the runtime host also accepts editor hooks, editor headers, tabs, and settings (`apps/desktop/src/extensions/desktopExtensionHost.ts:131-150`). Opening Settings compensates by activating every extension (`apps/desktop/src/settings/SettingsTab.tsx:54-61`).

**Cost.** The manifest carries two descriptions of activation, one of which is non-operative. Undeclared runtime surfaces cannot be discovered or stubbed, settings defeat laziness, editor-only extensions have no natural wake-up path, and future file handlers would add another ad hoc trigger.

**Alternative.** Keep stubs as the activation mechanism and simplify the contract: use an explicit `startup: true`/`activation: "startup"` only for eager work; remove command/view activation events; expand declarative contributions to tabs, settings schemas, resource handlers, and other discoverable surfaces. Split loading into a cheap declarative registration phase and lazy code activation. Settings schemas should be pure manifest data (or a separate data file), so Settings never executes extension code just to list controls.

**Effort/risk/payoff.** Medium effort and compatibility risk (manifest version bump/migration); high payoff through one source of truth, reliable lazy startup, and a scalable base for finding 2. Do not instead fully honor a separate VS Code-style event list: it duplicates contribution data without a demonstrated trigger that contributions cannot express.

## 4. Unify Markdown/frontmatter semantics in core

**Current decision and evidence.** Core frontmatter parsing is careful, preserves unknown fields, and reports diagnostics (`packages/core/src/frontmatter.ts:33-89,91-121`). But note indexing uses regexes for tags, wiki-links, tasks, fenced code, and inline code (`packages/core/src/markdown.ts:13-15,26-43,212-235`) rather than a Markdown syntax model. The editor independently locates frontmatter with a line scanner that rejects empty blocks (`apps/desktop/src/tabs/livePreview/frontmatterRange.ts:21-43`), `MarkdownEditor` has another regex for its initial body position (`apps/desktop/src/tabs/MarkdownEditor.tsx:49-53`), and Journal performs a third textual frontmatter edit (`apps/desktop/src/journal/frontmatterEdit.ts:14-18,33-74`).

**Cost.** Index/search/backlink/graph semantics can disagree with live preview on escaped/nested Markdown and edge cases such as BOMs, empty blocks, or a closing fence at EOF. More metadata editors will copy preservation-sensitive YAML surgery. The new guard improves data safety but currently depends on a different block definition than core (`apps/desktop/src/tabs/frontmatterGuard.ts:25-37`).

**Alternative.** Put a syntax-aware, platform-neutral Markdown analysis service in core (standalone CommonMark/GFM tokenizer/AST, or a deliberately shared Lezer parser if accepting that dependency). It should expose source ranges for frontmatter, links, tags, tasks, and protected regions. Add lossless frontmatter edit operations in core that preserve comments/order/line endings, then make CodeMirror adapters consume the shared ranges. First, cheaply extract and share one lexical `locateFrontmatter` contract with cross-layer fixtures; then replace regex note analysis incrementally.

**Effort/risk/payoff.** Hard for the full parser, medium for the frontmatter first slice; medium compatibility risk because existing indexing behavior may change. High payoff for trustworthy graph/backlinks/search and data-safe property editing.

## 5. Separate public extensions from privileged built-ins

**Current decision and evidence.** Built-ins and local extensions share lifecycle/bootstrap, which is good. They do not share equal capabilities: built-ins may provide React factories while disk extensions must mount framework-neutral DOM (`apps/desktop/src/extensions/desktopExtensionHost.ts:50-67`). Journal directly uses app search state/services—the source calls this a “built-in privilege” (`apps/desktop/src/extensions/builtins/journal.tsx:32-34`)—and accesses them directly in its panel (`apps/desktop/src/extensions/builtins/journal.tsx:278-315`). It also installs an app-local settings control outside the context API (`apps/desktop/src/extensions/builtins/journal.tsx:86-89`).

**Cost.** Journal proves lifecycle cleanup and registries, but not that a third party can build a comparable feature. Internal imports hide missing public services (search/query, richer navigation, controls), and refactors of app stores become extension breakage if authors imitate built-ins.

**Alternative.** Keep built-ins as extensions to dogfood activation, ownership, and contribution ordering. Define two explicit tiers: public API extensions may import only a small versioned SDK and use context services; privileged first-party adapters are visibly separate. Add search/index query and required navigation surfaces to the context as transport-friendly contracts, then remove journal reach-arounds. Do not expose Zustand stores or React internals merely to make parity easy.

**Effort/risk/payoff.** Hard for full journal parity, medium if introduced service-by-service; medium regression risk; high payoff in API credibility and future isolation. If parity is not a goal, move Journal out of `builtins/` and call it a first-party feature rather than presenting it as an extension exemplar. Note Stats is the better minimal public-API conformance fixture (`apps/desktop/src/extensions/builtins/noteStatsModel.ts:3-9`).

## 6. Make the core/adapters contract honest and enforceable

**Current decision and evidence.** Core itself obeys the no-React/DOM/Tauri rule, and desktop heavily reuses its note, settings, layout, and registry models. The vision, however, says app adapters implement interfaces defined in core (`plans/app-vision.md:66-71`); the workspace port is defined in the app beside its Tauri implementation (`apps/desktop/src/workspace/workspaceAdapter.ts:1-15,49-75`). Platform detection also leaks into shell/settings components (`apps/desktop/src/shell/useWorkspaceLifecycle.ts:1-8`; `apps/desktop/src/settings/ThemeProvider.tsx:1-7`; `apps/desktop/src/settings/SettingsTab.tsx:12-19`) despite the documented native-adapter boundary.

**Cost.** `packages/core` is currently a good pure utility/domain package, not the promised application hub. UI orchestration decides which environment exists, tests mock Tauri in feature modules, and alternative adapters cannot be assembled from a clear port set. Moving every reducer into core would overcorrect and make core a dumping ground.

**Alternative.** Choose explicitly: (a) revise the vision to “pure shared domain library” and keep ports in app feature modules; or (b), preferred for extension isolation and testability, define narrow workspace/document/search/settings ports and domain DTOs in core (or a new platform-neutral `application` package), with all Tauri/environment detection under `native/`. Add an import-boundary lint rule: outside `native/` and startup composition, no `@tauri-apps/*` imports.

**Effort/risk/payoff.** Medium; low-medium runtime risk, mostly dependency movement and test seams; medium-high payoff in architectural honesty, web/test adapters, and a future out-of-process extension host.

## 7. Grow `packages/ui` by reusable primitives, not app composites

**Current decision and evidence.** Token ownership and Tailwind mapping are clean (`packages/ui/src/styles/tokens.css:1-32`; `apps/desktop/src/index.css:21-80`). The package's public component surface is currently seven mobile/overlay utilities (`packages/ui/src/index.ts:1-8`), while shell controls such as `IconButton` remain app-local and encode app icon semantics (`apps/desktop/src/shell/IconButton.tsx:6-20,46-70`).

**Cost.** Calling this a broad design system overstates the boundary; generic button/dialog/empty-state/focus behavior can drift across desktop, phone, settings, and extension surfaces. Conversely, moving `PanelTitle`, tab chrome, or editor layout into `ui` would couple the package to one app shell without another independent client—the phone is the same app.

**Alternative.** Keep feature composites app-local. Promote only repeated, semantics-stable primitives (`Button` variants, icon-button base, dialog/overlay foundation, badge, empty state, focus helpers) into `packages/ui`, with accessibility tests and token-only styling. Publish an explicit promotion rule (“second independent feature use, no app stores/native imports”) rather than mass-moving files.

**Effort/risk/payoff.** Medium, low risk if incremental; medium payoff in consistency and extension-facing UI. The current token boundary should not be redesigned.

## Keep as-is

- **Core's runtime purity.** No production React/DOM/Node/Tauri dependencies; keep this hard rule (`packages/core/AGENTS.md:13-16`).
- **Settings schema/registry ownership.** Pure declarative definitions plus a subscribable registry are the right split (`packages/core/src/settings/types.ts:1-7,103-118`; `packages/core/src/settings/registry.ts:40-75`); desktop persistence/UI correctly consume it (`apps/desktop/src/settings/settingsStore.ts:50-67`).
- **Revocable, duplicate-rejecting contribution registries.** Stable snapshots and disposable ownership are a strong lifecycle base (`packages/core/src/contributions.ts:17-42,54-110`).
- **Stub-driven lazy activation and atomic replacement.** Keep the mechanism; simplify its declaration model rather than removing it (`apps/desktop/src/extensions/bootstrap.ts:156-189,224-260`).
- **Same lifecycle for built-in and local extensions.** Keep this dogfooding path, while making privilege tiers explicit.
- **Shared CodeMirror mount lifecycle.** State parking, callback rebinding, minimal external changes, and teardown are well-factored (`apps/desktop/src/tabs/useCodeMirrorView.ts:43-52,86-160`).
- **Markdown editor hook ordering and compartments.** Host-specific CodeMirror types stay outside core, while the generic registry contract stays in core (`apps/desktop/src/tabs/editorHookRegistry.ts:9-17,44-92`; `apps/desktop/src/tabs/markdownEditorHooks.ts:55-63`).
- **Token-first styling.** Semantic `--tn-*` ownership in `packages/ui` with app Tailwind aliases is the correct boundary; isolated dynamic inline styles (for zoom/measurement) are not a design-system violation.
