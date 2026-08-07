# Story: Tab View Registry — renderer contributions for tab kinds

**Status:** pending · **Urgency:** high · **Difficulty:** med

## Epic

Part of [Extensions](../pending-extensions-low-hard.md). Prerequisite for
[Journal & Calendar](../pending-journal-calendar-high-hard.md) story 7,
`journal-calendar/pending-calendar_tab_ui-high-hard.md`, which cannot be completed without
this.

## Why this exists

The journal calendar must open as a tab in the main tab area (journal/calendar D14, D27).
There is currently **no way to add a tab kind without editing the shell**, and the
half-built abstraction that looks like it should allow it does not.

Concretely, today:

- `apps/desktop/src/shell/TabContent.tsx` calls `createDesktopTabRegistry()` **at module
  scope**, producing an isolated throwaway instance.
- It consults that instance **only** for the `isAvailable` guard.
- Every actual renderer is a hard-coded `if (tab.kind === …)` branch in the same file.
- `DesktopTabView` has **no `factory` field**, so the registry cannot carry a renderer.
- `DesktopExtensionContext` has **no `tabs` surface**.

So the codebase already pays the indirection cost of a registry while getting none of its
benefit. This story finishes that abstraction rather than adding a new one.

`TabKind` is already an open union — `type TabKind = BuiltInTabKind | (string & {})` in
`packages/core/src/layout/index.ts` — so new kinds do not require a core change and no
exhaustiveness check exists to break.

## Decision — Option B, singleton registry with a renderer factory

Four options were compared. **Option B is chosen.** The rationale and the rejected
alternatives are recorded below so a later reader does not have to re-derive them.

**What B is:**

1. Add `factory: (props: DesktopTabRenderProps) => ReactNode` to `DesktopTabView`.
2. Export a module-level singleton `desktopTabRegistry` from
   `apps/desktop/src/tabs/tabRegistry.ts`, seeded with `builtInDesktopTabViews`.
3. Rewrite `TabContent` to look the kind up and call `view.factory(props)`, keeping the
   existing `isAvailable` guard and the `Unavailable` fallback for unknown kinds.
4. Move the five existing renderers into their registration entries.

**Why B and not the others:**

| Option | Verdict | Reason |
|---|---|---|
| **A** — add one more `if (tab.kind === "calendar")` branch | Rejected | Cheapest today, but it grows `TabContent` linearly with every future view and leaves the existing registry decorative. The codebase already decided registries are the pattern for contributed views; a second, divergent pattern for tabs is the maintenance cost, not the abstraction. |
| **B** — singleton + `factory` | **Chosen** | Mirrors the proven `desktopPanelRegistry` pattern already shipping in this repo, so it is one pattern across both surfaces rather than two. Finishes an abstraction that is already half-present. Cost per future tab kind drops to a single `register()` call. |
| **C** — B plus a `tabs` surface on `DesktopExtensionContext` | Deferred, not rejected | Commits a public extension API before any external consumer exists, and the tab render context is richer and less settled than `DesktopPanelContext`. B upgrades to C as a pure addition later; C does not reduce to B. Not needed for the journal — see "First-party is sufficient" below. |
| **D** — unify panels and tabs behind one view contribution | Rejected | Panels stay mounted and tabs do not; their contexts and roles differ. Forcing one abstraction over both is the classic leaky unification, has no incremental migration path, and carries the highest risk of becoming a dead abstraction. |

**First-party is sufficient — this is what keeps the story small.** The journal is a
*trusted, same-context built-in* module (`plans/technical-decisions.md`: extensions are
trusted local same-context JavaScript modules for the foreseeable beta). A built-in can
import `desktopTabRegistry` directly, exactly as built-in panels do. Therefore **no
extension-facing `tabs` API is built here**, and consequently:

- `createTabRegistry()` in `packages/core` is **not** refactored to return `Disposable`.
  Disposal only matters when a registration can go away at runtime, which only happens
  once third-party extensions can contribute tab kinds. Leaving core alone is deliberate.
- No namespaced-id scheme, no per-extension scoping, no deactivation handling for open
  tabs of a vanished kind.

**What would change this decision:** a third-party (non-built-in) extension needing to
contribute a tab kind. At that point do Option C as an additive change — a `tabs` surface
on `DesktopExtensionContext` wired to this same singleton, following the `panels` wiring in
`apps/desktop/src/extensions/desktopExtensionHost.ts` exactly, and *then* give the registry
disposal semantics. Keep that upgrade path in mind while shaping `DesktopTabRenderProps`,
but do not build for it now.

## Discovery questions

Genuinely open; answer before or during implementation. Everything else is settled above.

1. **What belongs in `DesktopTabRenderProps`?** The known minimum is the active `tab`,
   document contents, `onChange`, and `onSave`. Should it also carry a way to open another
   tab? A calendar day-click filters the journal popout rather than opening a tab
   (journal/calendar D25), so the calendar itself may not need it — but confirm before
   fixing the shape, because widening this type later is cheap and narrowing it is not.
2. **How do shell callbacks reach a factory** — threaded explicitly through
   `DesktopTabRenderProps` from `DesktopShell`, or via a small React context
   (`TabShellContext`)? Explicit props are more testable; context avoids a wide prop
   signature.
3. **How is lazy loading preserved?** `MarkdownEditor` is `React.lazy` behind `Suspense`
   today. Keeping the `lazy()` call and its `Suspense` boundary *inside* the editor kind's
   factory is the expected answer, but verify the produced chunks do not regress — the
   panel pattern has no lazy precedent, so this is novel here.

**STOP gate:** do not change `DesktopTabRenderProps` into a shape that requires
`packages/core` edits, and do not add an extension-facing `tabs` API, without explicit
approval. If implementation reveals that Option B cannot carry the editor kind without
one of those, stop and report rather than expanding scope.

## Prerequisites and ownership boundaries

- Owns: `apps/desktop/src/tabs/tabRegistry.ts`, the render dispatch in
  `apps/desktop/src/shell/TabContent.tsx`, and the mechanism by which a tab kind is opened.
- Does **not** own: any journal or calendar behavior. This story adds the seam; the
  calendar view is built in `journal-calendar/pending-calendar_tab_ui-high-hard.md`.
- Does **not** own: extension-facing contribution APIs (`pending-extension_contribution_surfaces-low-med.md`).
- `packages/core` stays platform-agnostic and, per the decision above, unchanged by this
  story. UI never calls Tauri directly; native access goes through
  `apps/desktop/src/native/` adapters.
- Styling: CSS Modules with shared `--tn-*` tokens. No Tailwind in production, no inline
  styles.

## Likely files

- `apps/desktop/src/tabs/tabRegistry.ts` — add `factory` to `DesktopTabView`, export the
  `desktopTabRegistry` singleton.
- `apps/desktop/src/shell/TabContent.tsx` — replace the `if` chain with a registry lookup;
  keep the `isAvailable` guard and `Unavailable` fallback.
- `apps/desktop/src/shell/DesktopShell.tsx` — owns `[tabState, dispatchTabs]`; source of
  the callbacks a factory needs, and the home of the generalized open-tab entry point.
- `apps/desktop/src/tabs/tabModel.ts` — `createStaticTab`, `createEditorTab`,
  `desktopTabReducer`; no change expected, confirm.
- `apps/desktop/src/commands/` — `DesktopCommandContext` currently exposes a bespoke
  `openSettings`. See task 5.
- `apps/desktop/src/tabs/tabRegistry.test.ts`, `apps/desktop/src/shell/DesktopShell.test.tsx`,
  `packages/core/src/layout/index.test.ts` — existing tests to extend; mirror the style of
  `apps/desktop/src/panels/panelRegistry.test.tsx`.

## Implementation tasks

Small and ordered. Each should be independently reviewable.

1. Add `DesktopTabRenderProps` and a `factory` field to `DesktopTabView`. Export
   `desktopTabRegistry` as a module-level singleton seeded with `builtInDesktopTabViews`.
   No behavior change yet.
2. Migrate the three placeholder kinds — `browser`, `graph`, `preview` — into factories
   that return the existing `Unavailable` element. **These are already stub branches, so
   this is nearly free** and it proves the seam before touching anything real.
3. Migrate `settings` (`<SettingsTab />`) into its factory.
4. Migrate the `editor` kind last, since it is the only complex one: preserve the
   `React.lazy` + `Suspense` boundary inside the factory and confirm chunking is unchanged.
   `TabContent` should now contain no per-kind branches.
5. Generalize tab opening. `dispatchTabs` is a closure inside `DesktopShell`, and external
   callers currently reach tab opening through the one-off
   `DesktopCommandContext.openSettings`. Replace that with a general
   `openTab(kind: TabKind, title: string)` and keep `openSettings` as a thin wrapper (or
   migrate its callers). Without this, a journal command has no way to open the calendar and
   the next bespoke feature adds another one-off method.
6. Add a `dev`-only or test-only sample kind, or use the calendar kind itself, to prove a
   new kind can be added with a single `register()` call and **zero** edits to
   `TabContent.tsx`. This is the story's real acceptance test.

## Acceptance criteria

- [ ] `desktopTabRegistry` is exported as a single module-level instance; no module creates
      its own via `createDesktopTabRegistry()` for rendering purposes.
- [ ] `TabContent.tsx` contains **no** `tab.kind === …` comparisons. It resolves a view,
      honours `isAvailable`, calls `factory`, and falls back to `Unavailable` for an
      unregistered kind.
- [ ] All five existing kinds render exactly as before, including the lazy-loaded editor.
- [ ] A new tab kind can be added by one `register()` call plus a component, with no shell
      edits — demonstrated by a test.
- [ ] A general `openTab` entry point exists; no bespoke per-kind open method is added.
- [ ] `packages/core` is unchanged, or any change is separately justified and approved.
- [ ] No extension-facing `tabs` API is added (deferred Option C).
- [ ] An unregistered `tab.kind` renders the `Unavailable` state rather than throwing or
      rendering blank.

## Automated validation

- `pnpm lint`, `pnpm typecheck`, `pnpm test` (or `./scripts/qa.sh`).
- Extend `tabRegistry.test.ts`: registration, lookup, unknown-kind fallback, `isAvailable`
  filtering, and that a newly registered kind is resolvable. Mirror
  `panelRegistry.test.tsx`.
- A `TabContent` test per kind asserting the factory output renders, including the
  `Suspense` path for the editor.
- `pnpm test:e2e` — existing tab e2e coverage must pass unchanged. Note that
  `test(e2e): disambiguate the Explorer activity-bar locator` landed recently; do not
  break activity-bar or tab locators.
- `pnpm build` — confirm the editor chunk still splits as before after task 4.

## Manual checks

- Desktop: open and close each existing tab kind; switch between them; confirm the editor
  still lazy-loads and dirty-state handling is unaffected (`DesktopShell` checks
  `tab.kind === "settings"` in its dirty-close dialog and dirty-flag sync — verify both
  still work after task 3).
- Desktop: open a tab of a deliberately unregistered kind and confirm the `Unavailable`
  state.
- Mobile: confirm the tab area still behaves on a narrow viewport; this story should not
  change mobile layout, so any difference is a regression.

## Non-goals

- No extension-facing `tabs` contribution API (Option C, deferred).
- No `packages/core` refactor of `createTabRegistry()` to add disposal — not needed while
  registrations are static built-ins.
- No unified panel/tab view abstraction (Option D, rejected).
- No calendar, journal, or any feature view. This story delivers only the seam.
- No new `BuiltInTabKind` literal is required — `TabKind` is already an open union. Adding
  one is optional and cosmetic.
- No change to tab persistence, ordering, drag-and-drop, or the tab bar's appearance.

## Handoff artifacts

- An exported `desktopTabRegistry` singleton and a documented `DesktopTabRenderProps`
  contract, so `journal-calendar/pending-calendar_tab_ui-high-hard.md` can register a
  calendar kind and render it with no shell edits.
- A general `openTab` entry point the journal popout's calendar button can call.
- A worked example (task 6) that the calendar story can copy directly.
- A note in this story recording the answers to the three discovery questions, so the next
  contributed view does not re-ask them.
