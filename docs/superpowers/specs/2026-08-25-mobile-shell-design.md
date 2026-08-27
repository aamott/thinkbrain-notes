# Mobile Shell Design

> Design spec for the phone presentation of the ThinkBrain shell. Approved
> 2026-08-25. Supersedes the navigation/layout direction recorded in
> `plans/pending-mobile-med-hard.md` and its two pending UI stories, which are
> re-cut against this document (see **Plan corrections**).

## Problem

The app builds, installs and runs on Android, but the UI is a desktop shell at
phone width. The activity bar is an icon-only rail with no labels and no hover;
the right-side panels are unreachable (`TitleBar.tsx` hides every right-panel
button under `max-[760px]:hidden`); and `DesktopShell.tsx` is 522 lines against
an 800-line ceiling, so the obvious fix — more `max-[760px]:` branches — makes
the file worse while producing two interleaved UIs inside one component.

The constraint that shapes everything below: **one product, one codebase, no
second UI to maintain.**

## Approach: two layout shells over one headless state layer

Rejected — breakpoint-only. The phone shape is not a reflow of the desktop
shape. Different header slots, rail becomes a drawer, tab strip becomes a
sheet, right docks become a sheet, activity bar disappears. Expressing that as
conditionals inside one component yields `{isPhone ? … : …}` scattered through
the largest file in the shell, untestable per form factor.

Rejected for now — a slot-driven shell with a per-form-factor layout
descriptor. It is the right end state if extension-contributed chrome or
user-movable panels return, but the ui-shell epic explicitly removed the
movable-slot stories, so there is no second consumer to justify the
abstraction. The headless layer below is its precondition either way, so
nothing is lost by deferring it.

Chosen: extract shell *state* from shell *chrome*, then give the chrome two
implementations.

```text
apps/desktop/src/shell/
  useShellState.ts     headless: tabs, documents, panel selection, palette,
                       conflicts, commands, workspace lifecycle
  ShellRoot.tsx        picks a chrome by form factor; owns nothing else
  DesktopShell.tsx     rail + docks + tab strip + status bar
  phone/
    PhoneShell.tsx     header + drawer + hub + sheets
```

`useShellState` returns what `DesktopShell` currently computes: `tabState`,
`dispatchTabs`, `documents`, `leftPanel`, `rightPanel`, `paletteOpen`,
`conflictBadges`, `syncStatus`, the workspace lifecycle bundle, and the
command-execution callback. Both shells consume the same object. Neither owns
domain state.

Panels are untouched. `WorkspaceExplorer`, `SearchPanel`, `OutlinePanel`,
`PropertiesPanel`, `SettingsContent`, the editor and every extension panel
render identically in both shells; only their container differs. This is what
keeps the cost at two chrome arrangements of roughly 150 lines each rather
than two UIs.

## Form-factor gate

Phone chrome when the pointer is coarse **and** the viewport is narrow:

```ts
const coarse = useCoarsePointer();
const narrow = useNarrowViewport(); // new; matchMedia("(max-width: 760px)")
const isPhone = coarse && narrow;
```

Both hooks are called unconditionally — `useCoarsePointer() && useNarrowViewport()`
would short-circuit and skip a hook call. `useNarrowViewport` is new and mirrors
`useCoarsePointer`'s `useSyncExternalStore` + `matchMedia` shape; the two belong
side by side in `shell/`.

Width alone cannot tell a 390px popout from a phone — the reasoning already
written into `journal/useCoarsePointer.ts`. Pointer alone would give a
touchscreen laptop the phone shell. Requiring both means a narrow desktop
window keeps the desktop chrome with touch-sized hit targets, and a
mouse-driven tablet keeps the desktop chrome outright.

The gate is form factor, not build target. Nothing branches on Android. The
phone shell is reachable in a browser and in Playwright by resizing with touch
emulation, which is how it gets tested.

Touch sizing stays a CSS concern via the existing `pointer-coarse:` utility
(`journal/journalChrome.tsx` exports `TOUCH = "pointer-coarse:min-h-11"`).
Do not restate the 44px minimum as a width breakpoint; it is a pointer
question, and both current mobile stories get this wrong.

## Navigation model

### The registry is already the single source of truth

`useLeftPanelContributions()` and `useRightPanelContributions()` return
`{id, label, icon, side, availability}` for built-ins and extensions alike.
The desktop rail renders from the left list; the phone drawer renders from the
same list with labels made visible. Active state and conflict badges are keyed
by panel id in shell state and read identically by both. No second menu model
exists, so the "one source of truth for entries, active state and badges"
requirement holds by construction rather than by discipline.

### The bottom hub is a shortcut bar, not a third side

A `side: "bottom"` was considered and rejected. `side` declares where a panel
*lives and renders*; the hub holds *pointers* to panels that live left or
right. Making `assistant` bottom-sided would remove it from the top-right
action-items menu, so a panel would need two sides or a duplicate
registration, and `LeftPanelContribution | RightPanelContribution`,
`entriesBySide`, and `Popout`'s `SIDE_CLASS` would each grow a third case with
no factory and no context.

The hub is instead an ordered list of targets resolved at render:

```ts
type HubItem =
  | { kind: "panel"; id: DesktopPanelId }      // label, icon, badge, active from the panel registry
  | { kind: "command"; id: DesktopCommandId }  // label + icon from the command; no active state
  | { kind: "menu" };                          // opens the drawer; always last, not removable
```

Default: `explorer` panel, `search` panel, `new-note` command, `assistant`
panel, menu.

Consequences, all of which fall out rather than being built:

- No registry change. Nothing new in `PanelContribution`, `Popout`, or the
  side-narrowed union.
- Badges and active state are free for `kind: "panel"` — same source as the rail.
- Extensions become hub-reachable with no extension-API change; they already
  register panels and commands. Pinning the journal is
  `{kind: "panel", id: "journal-calendar.journal"}`.
- Activating a `kind: "panel"` item is `revealPanel(id)` / `revealLeftPanel(id)`,
  both of which already exist on `DesktopCommandContext`. The assistant
  shortcut is that one call.

Active state applies only to `kind: "panel"`. A command fires and returns; it
has nothing to be active about. The hub renders no active indicator for
command items, and this is intended, not an omission.

The hub is rendered only by `PhoneShell`. The model is data, so keeping it
generic costs nothing, but no desktop consumer is built speculatively.

### There is no "Home"

The mockup's first hub slot is a folder icon labeled Home. No such concept
exists in the app and none is introduced. The slot is a shortcut, and its
label comes from its target's own registration — so it reads "Files", or
"Journal" if the user pins that instead. Labels stay correct automatically
when an extension renames itself, and "make the journal my default" is
reordering rather than configuration.

Hub labels are not user-overridable in v1. An override field costs a setting,
a fallback path and an i18n question for a five-slot bar whose icons carry
most of the meaning.

### Rename: Explorer becomes Files

`builtInDesktopPanels` renames the `explorer` panel's `label` from `"Explorer"`
to `"Files"`, on desktop as well. "Explorer" is VS Code vocabulary in a notes
app. The panel **id** stays `explorer` — it appears in persisted workspace
state, settings keys and command ids, and must not drift.

## Phone shell anatomy

### Surface rules

Two kinds of overlay, deliberately distinguishable:

- **Navigation chrome peeks.** The drawer is 86% wide, max 300px, over a
  scrim. It reads as something you tap out of.
- **Content takes over.** A revealed panel fills the width between the header
  and the hub. The header's left slot becomes ✕/Back.

The hub stays visible over a revealed panel. That is what makes it a
navigation hub rather than a home screen, and it means "full screen" means
full *width*, not full viewport.

This rule requires deleting `max-[760px]:left-[var(--tn-size-activitybar-width)]`
from `panels/Popout.tsx`. With the rail gone that inset is a 3rem dead strip.

### Header

Left slot: hamburger, or ✕/Back when a panel or sheet is open.
Center: active document title.
Right: tab count button, then an overflow `⋯` button.

The two right-hand controls open different things, and the epic currently
flattens them into one sentence. The tab count opens the **tab switcher
grid**; `⋯` opens the **inspector sheet**.

### Tab switcher

Tabs live in the header, not the hub — the browser-like placement. The count
button opens a **grid of cards**, two columns, as Chrome on Android does: each
card carries a title bar with a close affordance, a dirty marker, and a preview
of the tab's content. The active tab's card is ringed. The desktop tab strip
does not render on phone.

**The preview is a text excerpt, not a screenshot.** Chrome rasterizes the page;
we cannot and should not. The webview offers no per-element capture, only the
active tab has a mounted CodeMirror, and rendering true thumbnails would mean
mounting an editor per open tab to photograph it. Meanwhile `documents` already
holds the full contents of every open tab — including restored ones, which
`useWorkspaceLifecycle.ts:115` loads eagerly — so an excerpt costs nothing.

It is also the better preview for this app. At thumbnail scale every Markdown
note is the same grey rectangle; what identifies a note is its opening lines.
The excerpt strips YAML frontmatter via `parseFrontmatter(contents).body`, or
every card would show `---` and a title key instead of the note.

Tabs with no text — settings, merge, and registered-but-unavailable kinds —
show a placard naming the kind rather than an empty card.

### Inspector sheet

`⋯` opens a sheet whose segmented control is
`useRightPanelContributions()` — outline, properties, backlinks, assistant,
plus extension right panels. This is the fix for right panels being wholly
unreachable on phone today, and it is currently owned by no story.

### Drawer

Renders `useLeftPanelContributions()` with visible labels, active state and
conflict badges, plus a workspace switcher header, a command-palette entry,
and App Settings in the footer. Long-press on a row offers **Pin to bottom
bar**; long-press on a hub item offers **Remove**. That pair is the whole v1
customization affordance — a drag-reorder screen is deferred, since the editor
is the expensive half and pin/remove covers the actual use case.

## What moves where

| Desktop surface | Phone |
| --- | --- |
| `ActivityBar` rail | Drawer rows (same registry) |
| Right-panel buttons in `TitleBar` | Inspector sheet behind `⋯` |
| Tab strip | Tab switcher grid behind the count button |
| `StatusBar` | Header + drawer badges (see below) |
| `BottomPanel` | Sheet |
| Left/right popouts | Full-width panel between header and hub |

Three bottom chromes do not fit on a phone. The shell root grid
(`grid-rows-[2.25rem_auto_minmax(0,1fr)_1.5rem]`) ends in a 1.5rem `StatusBar`,
`BottomPanel` is `flex-[0_0_12rem]` inside the editor column, and the hub wants
60px plus safe-area inset. The hub owns the bottom edge. `StatusBar`'s real
content — sync state and conflict counts — folds into the header and the
drawer's badges; `BottomPanel` becomes a sheet like the others.

### Soft keyboard

A bottom-anchored hub must not float above the keyboard. `MetadataBottomSheet.tsx`
already tracks `window.visualViewport` for exactly this; the hub uses the same
handling. `windowSoftInputMode="adjustResize"` shipped with the CodeMirror
story, so the webview does resize, but the hub is the one element whose
position depends on it.

## Core API changes

Two, both small, both deliberate.

**1. `icon?: string` on `CommandContribution`** (`packages/core/src/contributions.ts:151`).
`DesktopCommand` today is `{id, title, keywords, keybinding, availability, handler}`
with no glyph, so `kind: "command"` hub items have nothing to render. The field
is a host-defined identifier resolved through the existing `panelIcons` map in
`shell/panelIconsModel.ts` — mirroring `PanelContribution.icon`'s existing
contract, not a component. Optional, so no existing command breaks. This is a
public API change and is made now rather than deferred, because deferring means
reworking the hub later.

**2. `explorer` panel label becomes "Files."** Id unchanged.

## Persistence

`ui.mobileHub` is an app-scoped setting holding the serialized `HubItem[]`,
declared as `type: "string"` with a custom control — following the established
precedent of `journal.fieldDefinitions`, which stores JSON the same way.

`SettingType` is `"boolean" | "string" | "number" | "enum" | "path"`; there is
no list or JSON type. Adding one would touch validation, import/export, the
control registry and settings search, and is a cross-cutting decision that
should not ride along with this work. Noted as a future cleanup, not adopted
here.

Unknown or unavailable ids are skipped at render, not repaired on load — an
extension that is merely deactivated must not lose its pin.

## Testing

- `useShellState` unit-tested headlessly, with no chrome mounted.
- `DesktopShell` and `PhoneShell` each get their own render tests; neither
  needs the other mounted.
- Hub resolution is a pure function over the two registries: panel item →
  label/icon/badge/active, command item → label/icon, unknown id → skipped.
- Drawer and sheets: focus trap, Escape, scrim dismissal, focus restoration —
  matching what `SettingsNav` already established.
- Playwright covers the phone shell by viewport plus touch emulation. No
  Android-only path exists to test around.

## Non-goals

- No `apps/mobile/`, no second adapter set, no React Native.
- No slot-descriptor abstraction until a third form factor or movable panels
  need one.
- No drag-reorder settings screen for the hub in v1.
- No desktop hub.
- No user-overridable hub labels.
- No new `SettingType`.

## Plan corrections

These are wrong or stale in the current plans and are corrected by this spec.

1. **Bottom hub contents.** `pending-mobile_navigation_menu` says the hub is
   "Home, Search, New Note, Tabs and Menu"; the mockup's injected template is
   Home, Search, New, AI Agent, Menu. Neither is adopted. Tabs move to the
   header; the hub is a configurable target list with the defaults above.
2. **The mockup is a look-and-feel reference, not a source of truth.** It
   declares its own `@theme` (`--color-tn-bg`, `--color-tn-primary: #8b5cf6`)
   producing `bg-tn-surface`, `text-tn-fg-muted`, `border-tn-border-subtle`.
   The app maps `--tn-color-*` through `@theme inline` to `bg-sidebar`,
   `bg-editor`, `text-muted-foreground`, `border-border`. There is no class
   overlap, and the mockup is dark-only with a hardcoded violet accent. The
   binding decisions are the prose in this spec.
3. **Story boundaries overlap and leave a gap.** `mobile_navigation_menu`
   defers "panel widths, the tab strip, the editor chrome" to
   `responsive_layout`, whose acceptance criteria mention none of them, while
   its AC #2 ("bottom tab navigation appears on mobile") duplicates the nav
   story. Re-cut on chrome/navigation versus surfaces-inside-panels.
4. **Right panels are unreachable and untracked.** `TitleBar.tsx:170` hides
   every right-panel button below 760px. The inspector sheet owns this.
5. **`Popout.tsx:16`'s activity-bar inset** must go on phone.
6. **Touch sizing is a pointer question,** not a width breakpoint. Both stories
   say "below 760px"; the codebase already chose `pointer-coarse:`.
7. **The keyboard blocker is stale.** The epic still lists tauri#10631 as
   gating mobile editing while `done-codemirror_mobile_testing` records
   `adjustResize` shipped and editing verified. Update Known Limitations to
   the residual risk: emulator-only verification, and hub positioning under
   `visualViewport`.
8. **"Home" is undefined** in every plan document. It is removed rather than
   defined.
9. **The header's two right controls open different surfaces.** The epic's
   "header and bottom Menu affordances open the same drawer" is true only of
   the hamburger and the hub's Menu item.

## Sequencing

Refactor first; no rework. Each step is independently shippable and leaves the
desktop app unchanged.

1. **Headless extraction.** `useShellState` + `ShellRoot`; `DesktopShell`
   becomes chrome only. Behaviour identical, `DesktopShell.tsx` drops well
   under the file-size ceiling.
2. **Core API + rename.** `icon?` on `CommandContribution`; icons on the
   built-in commands the default hub needs; `explorer` label to "Files".
3. **UI primitives in `packages/ui`.** Drawer, BottomSheet, BottomNav —
   generic, token-driven, theme-correct, with focus/dismissal behaviour.
4. **Hub model.** `HubItem`, the resolver over both registries, the
   `ui.mobileHub` setting, defaults.
5. **`PhoneShell`.** Header, drawer, hub, tab switcher grid, inspector sheet.
6. **Surface fixes.** `Popout` inset, StatusBar fold, BottomPanel as sheet,
   `visualViewport` handling for the hub, `pointer-coarse:` sizing sweep.
7. **Pin/remove long-press.**
