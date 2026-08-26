# Mobile Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the app a phone presentation — header, drawer, configurable bottom hub, sheets — without creating a second UI to maintain.

**Architecture:** Shell *state* is extracted from shell *chrome* into a headless `useShellState`. `ShellRoot` picks one of two chrome implementations by form factor. `DesktopShell` keeps the rail and docks; `PhoneShell` renders header, drawer, hub and sheets. Panels, tabs, documents, commands and the panel registry are shared untouched — the phone drawer and the desktop rail both render `useLeftPanelContributions()`.

**Tech Stack:** React 19, TypeScript, Zustand, Tailwind v4 (`--tn-*` tokens via `@theme inline`), vitest + happy-dom, Playwright, Tauri v2.

**Spec:** `docs/superpowers/specs/2026-08-25-mobile-shell-design.md` — read it before Task 1. The plan argues from the spec; both travel together.

## Global Constraints

- **No `apps/mobile/`.** One codebase, one build target, no second adapter set.
- **`packages/core` is platform-agnostic** — no React, no DOM, no Node imports.
- **File size:** under 500 lines preferred, never over 800 (`AGENTS.md`).
- **No `any`.** Prefer strict types or `unknown`.
- **Test style:** vitest + `// @vitest-environment happy-dom`, raw `createRoot` + `act` from `react-dom/client`, queried by `aria-label` with `querySelector`. React Testing Library is **not** a dependency — do not add it. Copy the harness from `apps/desktop/src/shell/ActivityBar.test.tsx`.
- **Styling:** Tailwind utility classes over the mapped tokens (`bg-sidebar`, `bg-editor`, `text-muted-foreground`, `border-border`). Never invent a token namespace. Never hardcode a hex colour.
- **Touch sizing is a pointer question:** use the `pointer-coarse:` variant (`journal/journalChrome.tsx` exports `TOUCH = "pointer-coarse:min-h-11"`). Never express a touch minimum as a width breakpoint.
- **Panel and setting ids never drift** — they appear in persisted workspace state and settings keys. Labels may change; ids may not.
- **No new `SettingType`.** `SettingType` is `"boolean" | "string" | "number" | "enum" | "path"`. JSON-shaped settings are stored as `type: "string"` with a custom control, following `journal.fieldDefinitions`.
- **`pnpm qa` must pass** before any task is considered done (lint, typecheck, tests, formatting; cross-platform via `scripts/qa.mjs`).
- **Commits require explicit user approval** (`AGENTS.md`). Each task's Commit step is a proposal — present the message, wait for the go-ahead. No signatures in commit messages.
- **Desktop behaviour must be unchanged** by Tasks 1–9. Any desktop-visible diff before Task 10 is a bug in the extraction.

---

### Task 1: Extract headless shell state

`DesktopShell.tsx` is 522 lines of state plus chrome. This task moves every non-JSX concern into a hook so a second chrome can consume it. **No behaviour changes.** The test is that the existing suite still passes plus one new test proving the hook works with no chrome mounted.

**Files:**
- Create: `apps/desktop/src/shell/useShellState.ts`
- Create: `apps/desktop/src/shell/useShellState.test.tsx`
- Modify: `apps/desktop/src/shell/DesktopShell.tsx` — becomes chrome only

**Interfaces:**
- Consumes: existing `useDocumentViews`, `useWorkspaceLifecycle`, `useSyncSurfaces`, `useDesktopCommands`, `usePanelResize`, `useExternalDocumentSync`, `useSettingsStore`, `useWikiLinkIndexStore`.
- Produces: `useShellState(): ShellState`. Every later task consumes this exact shape.

```ts
export interface ShellState {
  // tabs & documents
  readonly tabState: DesktopTabState;
  readonly dispatchTabs: Dispatch<DesktopTabAction>;
  readonly activeTab: DesktopTab | null;
  readonly activeDocument: DocumentView | undefined;
  readonly documents: Readonly<Record<string, DocumentView>>;
  readonly conflicts: ReadonlySet<string>;
  readonly unsavedNoteContents: string | null;
  readonly saveDocument: (tab: DesktopTab) => Promise<boolean>;
  readonly updateDocument: (tabId: string, contents: string) => void;
  readonly loadDocumentIntoView: (tabId: string, rootPath: string, relativePath: string) => void;
  readonly openMarkdownDocument: (rootPath: string, relativePath: string) => void;
  readonly keepMyVersion: (tab: DesktopTab) => void;
  readonly loadDiskVersion: (tab: DesktopTab) => void;
  readonly dismissEmptied: (tabId: string) => void;
  readonly onOpenNote: (relativePath: string) => void;

  // panels
  readonly leftPanel: LeftPanel | null;
  readonly rightPanel: RightPanel | null;
  readonly setRightPanel: Dispatch<SetStateAction<RightPanel | null>>;
  readonly selectLeftPanel: (panel: LeftPanel) => void;
  readonly toggleRightPanel: (panel: RightPanel) => void;
  readonly bottomPanel: BottomPanel | null;
  readonly updateBottomPanel: (panel: BottomPanel | null) => void;
  readonly toggleBottomPanel: () => void;

  // workspace
  readonly workspaceName: string | null;
  readonly restoredWorkspacePath: string | null;
  readonly workspaceFiles: readonly NativeMarkdownFileEntry[];
  readonly recentWorkspacePaths: readonly string[];
  readonly stateRestored: boolean;
  readonly explorerProps: ExplorerProps;
  readonly versionsOf: string | null;
  readonly showVersionsOf: (rootPath: string, relativePath: string) => void;
  /** Clears the history panel's note filter. `DesktopShell` inlines this today
   *  as `setVersionsOf(null)`; both chromes need it, so it moves into the hook. */
  readonly clearVersions: () => void;
  readonly openSyncPanel: (panel: "conflicts" | "history") => void;
  readonly reviewConflict: (copyPath: string, notePath: string) => void;

  // chrome-agnostic services
  readonly paletteOpen: boolean;
  readonly openPalette: () => void;
  readonly closePalette: (restoreFocus?: boolean) => void;
  readonly paletteCommands: readonly DesktopCommand[];
  readonly runCommand: (command: DesktopCommand) => void;
  readonly openSettingsTab: () => void;
  readonly syncStatus: SyncStatus;
  readonly conflictBadges: Readonly<Record<string, number>>;
  readonly noteIndex: WikiLinkNoteIndex;
  readonly update: AppUpdateState;

  // desktop-only, ignored by PhoneShell
  readonly leftWidth: number;
  readonly rightWidth: number;
  readonly resize: PanelResizeControls;
  readonly resetPanelWidth: (side: PanelSide) => void;
}
```

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/shell/useShellState.test.tsx`. This proves the hook runs with no chrome — the whole point of the extraction.

```tsx
// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { useShellState, type ShellState } from "./useShellState";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

/** Renders the hook with no chrome and hands back its latest value. */
const renderShellState = async (): Promise<() => ShellState> => {
  let latest: ShellState | null = null;
  const Probe = (): null => {
    latest = useShellState();
    return null;
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<Probe />));
  return () => {
    if (!latest) throw new Error("useShellState did not render");
    return latest;
  };
};

describe("useShellState", () => {
  it("provides shell state without any chrome mounted", async () => {
    const state = await renderShellState();

    expect(state().tabState.tabs).toEqual([]);
    expect(state().leftPanel).toBe("explorer");
    expect(state().rightPanel).toBeNull();
    expect(state().paletteOpen).toBe(false);
  });

  it("opens and closes the command palette", async () => {
    const state = await renderShellState();

    await act(async () => state().openPalette());
    expect(state().paletteOpen).toBe(true);

    await act(async () => state().closePalette(false));
    expect(state().paletteOpen).toBe(false);
  });

  it("opens a settings tab through the shared action", async () => {
    const state = await renderShellState();

    await act(async () => state().openSettingsTab());

    expect(state().tabState.tabs.map((tab) => tab.id)).toContain("settings");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @thinkbrain/desktop test -- useShellState`
Expected: FAIL — `Failed to resolve import "./useShellState"`.

- [ ] **Step 3: Create the hook by moving code out of `DesktopShell.tsx`**

Move, do not rewrite. Cut from `DesktopShell.tsx` into `useShellState.ts`, in this order, and return them as the `ShellState` above:

1. `useDesktopCommands()`, `useReducer(desktopTabReducer, …)`, `tabStateRef` + its sync effect.
2. `rightPanel` / `paletteOpen` state, `useTheme`, `settingsIsDirty`, `noteIndex`, `hasSettingsTab` and the dirty-mirroring effect.
3. The whole `useDocumentViews` and `useWorkspaceLifecycle` destructure.
4. `openPalette`, `closePalette`, `openSettingsTab`, `onOpenNote`, `reviewConflict`, `toggleLivePreview`.
5. `handlePaletteCommand` — rename to `runCommand`, body unchanged.
6. `activeTab`, `versionsOf`, `showVersionsOf`, `openSyncPanel`.
7. `useExternalDocumentSync`, `useSettingsQuarantineAdapter`, `usePanelResize`, `useSyncSurfaces`, `useAppUpdate`.
8. `unsavedNoteContents`, `activeDocument`.
9. The global keydown effect **stays in `useShellState`** — shortcuts are behaviour, not chrome.

Two things are **new**, not moved, because both chromes need them and `DesktopShell` currently inlines them:

```ts
const toggleRightPanel = useCallback((panel: RightPanel) => {
  setRightPanel((current) => (current === panel ? null : panel));
}, []);

const explorerProps = useMemo(() => ({
  initialWorkspacePath: stateRestored ? restoredWorkspacePath : null,
  onWorkspaceOpened: handleWorkspaceOpened,
  onWorkspaceUnavailable: handleWorkspaceUnavailable,
  onMarkdownFileSelected: openMarkdownDocument,
  onMarkdownFileCreated: handleMarkdownFileCreated,
  onNewNoteFocusHandled: acknowledgeNewNoteFocus,
  newNoteFocusRequest,
  recentWorkspacePaths,
  onWorkspaceLaunched: handleWorkspaceLaunched,
  onShowVersions: showVersionsOf
}), [stateRestored, restoredWorkspacePath, handleWorkspaceOpened, handleWorkspaceUnavailable,
     openMarkdownDocument, handleMarkdownFileCreated, acknowledgeNewNoteFocus,
     newNoteFocusRequest, recentWorkspacePaths, handleWorkspaceLaunched, showVersionsOf]);
```

The CSS custom-property effect (`--tn-shell-left-width` / `--tn-shell-right-width`) is **chrome** and stays in `DesktopShell.tsx`, because it writes to that component's own root ref.

- [ ] **Step 4: Rewrite `DesktopShell.tsx` to consume the hook**

`DesktopShell` keeps only: `rootRef`, the width custom-property effect, and the JSX it already returns. Its first line becomes:

```tsx
export function DesktopShell({ shell }: { readonly shell: ShellState }) {
```

Every `foo` in the JSX becomes `shell.foo`. Do not change any markup, class name or prop in this task.

- [ ] **Step 5: Run the full desktop suite**

Run: `pnpm --filter @thinkbrain/desktop test`
Expected: PASS. `DesktopShell.test.tsx`, `DesktopShell.dirtySync.test.tsx` and `useDocumentViews.restore.test.tsx` must pass **without edits to their assertions** — if an assertion needs changing, the extraction changed behaviour and is wrong. Updating how they *construct* `DesktopShell` (passing `shell={useShellState()}` from a probe wrapper) is expected and fine.

- [ ] **Step 6: Confirm the file shrank**

Run: `wc -l apps/desktop/src/shell/DesktopShell.tsx apps/desktop/src/shell/useShellState.ts`
Expected: `DesktopShell.tsx` well under 300 lines; `useShellState.ts` under 500. If `useShellState.ts` exceeds 500, split the document/tab half into `useShellDocuments.ts` and compose.

- [ ] **Step 7: Run QA and commit**

Run: `pnpm qa`

```bash
git add apps/desktop/src/shell/useShellState.ts apps/desktop/src/shell/useShellState.test.tsx apps/desktop/src/shell/DesktopShell.tsx
git commit -m "refactor(shell): extract headless shell state from DesktopShell"
```

---

### Task 2: Form-factor gate and `ShellRoot`

**Files:**
- Create: `apps/desktop/src/shell/useNarrowViewport.ts`
- Create: `apps/desktop/src/shell/useNarrowViewport.test.tsx`
- Create: `apps/desktop/src/shell/ShellRoot.tsx`
- Create: `apps/desktop/src/shell/ShellRoot.test.tsx`
- Modify: wherever `<DesktopShell />` is mounted today (find with `grep -rn "DesktopShell" apps/desktop/src --include=*.tsx | grep -v test`)

**Interfaces:**
- Consumes: `useShellState` (Task 1), existing `useCoarsePointer` from `apps/desktop/src/journal/useCoarsePointer.ts`.
- Produces: `useNarrowViewport(): boolean`, `usePhoneChrome(): boolean`, `<ShellRoot />`.

- [ ] **Step 1: Write the failing test for the viewport hook**

```tsx
// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useNarrowViewport } from "./useNarrowViewport";

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let listeners: Array<() => void> = [];

/** Installs a matchMedia stub whose match result can be flipped mid-test. */
const stubMatchMedia = (matches: boolean): { set: (next: boolean) => void } => {
  let current = matches;
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: current,
    media: query,
    addEventListener: (_: string, listener: () => void) => listeners.push(listener),
    removeEventListener: (_: string, listener: () => void) => {
      listeners = listeners.filter((entry) => entry !== listener);
    }
  }));
  return {
    set: (next: boolean) => {
      current = next;
      for (const listener of listeners) listener();
    }
  };
};

beforeEach(() => {
  listeners = [];
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
  root = null;
  container = null;
});

describe("useNarrowViewport", () => {
  it("reports the current match and follows changes", async () => {
    const media = stubMatchMedia(false);
    const seen: boolean[] = [];
    const Probe = (): null => {
      seen.push(useNarrowViewport());
      return null;
    };
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(<Probe />));

    expect(seen.at(-1)).toBe(false);

    await act(async () => media.set(true));

    expect(seen.at(-1)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @thinkbrain/desktop test -- useNarrowViewport`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

Deliberately the same shape as `useCoarsePointer.ts` — the two belong side by side and should be read as a pair.

```ts
import { useSyncExternalStore } from "react";

/**
 * Whether the viewport is phone-narrow.
 *
 * Pairs with `useCoarsePointer`: width alone cannot tell a 390px popout from a
 * phone, and pointer alone would hand a touchscreen laptop the phone chrome.
 * `usePhoneChrome` requires both.
 */

const QUERY = "(max-width: 760px)";

const query = (): MediaQueryList | null =>
  typeof window === "undefined" || typeof window.matchMedia !== "function"
    ? null
    : window.matchMedia(QUERY);

const subscribe = (onChange: () => void): (() => void) => {
  const list = query();
  if (!list) return () => undefined;
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
};

/** Server-side and on runtimes without the API, assume a wide viewport. */
const getSnapshot = (): boolean => query()?.matches ?? false;

export function useNarrowViewport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
```

- [ ] **Step 4: Write the failing test for `ShellRoot`**

```tsx
// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ShellRoot } from "./ShellRoot";

vi.mock("./useNarrowViewport", () => ({ useNarrowViewport: () => narrow }));
vi.mock("../journal/useCoarsePointer", () => ({ useCoarsePointer: () => coarse }));

let narrow = false;
let coarse = false;
let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const render = async (): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<ShellRoot />));
  return container;
};

describe("ShellRoot", () => {
  it("renders desktop chrome on a wide mouse-driven window", async () => {
    narrow = false;
    coarse = false;

    const host = await render();

    expect(host.querySelector('[aria-label="ThinkBrain desktop workspace"]')).not.toBeNull();
  });

  it("keeps desktop chrome in a narrow window driven by a mouse", async () => {
    narrow = true;
    coarse = false;

    const host = await render();

    expect(host.querySelector('[aria-label="ThinkBrain desktop workspace"]')).not.toBeNull();
  });

  it("keeps desktop chrome on a wide touch screen", async () => {
    narrow = false;
    coarse = true;

    const host = await render();

    expect(host.querySelector('[aria-label="ThinkBrain desktop workspace"]')).not.toBeNull();
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `pnpm --filter @thinkbrain/desktop test -- ShellRoot`
Expected: FAIL — module not found.

- [ ] **Step 6: Implement `ShellRoot`**

`PhoneShell` does not exist yet, so this task renders `DesktopShell` unconditionally while still computing the gate. Task 10 swaps the placeholder for the real component; the gate itself ships and is tested now.

```tsx
import { useCoarsePointer } from "../journal/useCoarsePointer";
import { DesktopShell } from "./DesktopShell";
import { useNarrowViewport } from "./useNarrowViewport";
import { useShellState } from "./useShellState";

/**
 * Whether to render phone chrome.
 *
 * Both hooks are called unconditionally — `useCoarsePointer() && useNarrowViewport()`
 * would short-circuit and skip a hook call.
 */
export function usePhoneChrome(): boolean {
  const coarse = useCoarsePointer();
  const narrow = useNarrowViewport();
  return coarse && narrow;
}

/**
 * Chooses a chrome for the shared shell state.
 *
 * The gate is form factor, not build target: nothing here branches on Android,
 * so the phone chrome is reachable in a browser and in Playwright.
 */
export function ShellRoot() {
  const shell = useShellState();
  // Consumed by PhoneShell in a later task; computed now so the gate ships tested.
  usePhoneChrome();
  return <DesktopShell shell={shell} />;
}
```

- [ ] **Step 7: Mount `ShellRoot` in place of `DesktopShell`**

Run: `grep -rn "DesktopShell" apps/desktop/src --include=*.tsx | grep -v test`
Replace the app-level mount with `<ShellRoot />`. `DesktopShell` is no longer mounted directly outside its own tests.

- [ ] **Step 8: Run the tests and QA**

Run: `pnpm --filter @thinkbrain/desktop test && pnpm qa`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src/shell/useNarrowViewport.ts apps/desktop/src/shell/useNarrowViewport.test.tsx apps/desktop/src/shell/ShellRoot.tsx apps/desktop/src/shell/ShellRoot.test.tsx
git commit -m "feat(shell): add form-factor gate and ShellRoot"
```

---

### Task 3: Command icons and the Files rename

Two small, deliberate public changes the hub depends on. `DesktopCommand` has no glyph today, so a `kind: "command"` hub item has nothing to render.

**Files:**
- Modify: `packages/core/src/contributions.ts` — `CommandContribution`
- Modify: `apps/desktop/src/commands/commandRegistry.ts` — icons on built-in commands
- Modify: `apps/desktop/src/panels/panelRegistryModel.tsx` — `explorer` label
- Modify: `apps/desktop/src/commands/commandRegistry.test.ts`
- Modify: `apps/desktop/src/shell/ActivityBar.test.tsx` — asserts `aria-label="Explorer"`

**Interfaces:**
- Produces: `CommandContribution.icon?: string` — a host-defined identifier resolved through `panelIcons` in `apps/desktop/src/shell/panelIconsModel.ts`, exactly as `PanelContribution.icon` already works. Not a component; `packages/core` stays platform-agnostic.

- [ ] **Step 1: Write the failing tests**

Append to `apps/desktop/src/commands/commandRegistry.test.ts`:

```ts
it("gives the new-note command an icon the hub can render", () => {
  const newNote = builtInDesktopCommands.find((command) => command.id === "new-note");

  expect(newNote?.icon).toBe("plus");
});
```

Append to `apps/desktop/src/panels/panelRegistry.test.tsx`:

```tsx
it("labels the explorer panel Files", () => {
  const explorer = builtInDesktopPanels.find((panel) => panel.id === "explorer");

  expect(explorer?.label).toBe("Files");
  // The id is persisted in workspace state and settings keys; it must not drift.
  expect(explorer?.id).toBe("explorer");
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @thinkbrain/desktop test -- commandRegistry panelRegistry`
Expected: FAIL — `undefined` is not `"plus"`, and `"Explorer"` is not `"Files"`.

- [ ] **Step 3: Add `icon?` to the core contribution**

In `packages/core/src/contributions.ts`, inside `interface CommandContribution` (currently at line 151), after `title`:

```ts
  /**
   * Host-defined icon identifier, not an icon component.
   *
   * Mirrors `PanelContribution.icon`: core is platform-agnostic and extension
   * manifests are JSON, so an extension can never hand the host a component.
   * The desktop layer resolves this through `panelIcons`. Optional — a command
   * without one is palette-only and cannot be pinned to the mobile hub.
   */
  readonly icon?: string;
```

- [ ] **Step 4: Give the default-hub commands their icons**

In `apps/desktop/src/commands/commandRegistry.ts`, add `icon` to the commands the default hub needs. `plus` and `search` are already in the `panelIcons` map — do not invent names.

```ts
  available({
    id: "new-note",
    title: "New note",
    icon: "plus",
    keywords: ["create", "markdown", "file"],
    handler: ({ showExplorer, focusNewNote, closePalette }) => {
      showExplorer();
      focusNewNote();
      closePalette(false);
    }
  }),
```

- [ ] **Step 5: Rename the explorer label**

In `apps/desktop/src/panels/panelRegistryModel.tsx`, in `builtInDesktopPanels`, change **only** the label:

```tsx
  {
    id: "explorer",
    label: "Files",
    icon: "files",
    side: "left",
    keepMounted: true,
    availability: () => true,
    factory: ({ explorerProps }) => <WorkspaceExplorer {...explorerProps} />
  },
```

- [ ] **Step 6: Update assertions that referenced the old label**

Run: `grep -rn '"Explorer"' apps/desktop/src apps/desktop/e2e`
Update each assertion to `"Files"`. Do **not** change any occurrence of the id `explorer`.

- [ ] **Step 7: Run tests and QA**

Run: `pnpm --filter @thinkbrain/desktop test && pnpm qa`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/contributions.ts apps/desktop/src/commands/commandRegistry.ts apps/desktop/src/panels/panelRegistryModel.tsx
git add -u apps/desktop/src apps/desktop/e2e
git commit -m "feat(core): add optional command icons; rename Explorer panel to Files"
```

---

### Task 4: Overlay primitives in the design system

`packages/ui` holds only `Button` today and has no DOM test environment. This task adds both, plus the dismissal behaviour the drawer and every sheet share.

**Files:**
- Modify: `packages/ui/package.json` — add `happy-dom` devDependency
- Create: `packages/ui/vitest.config.ts`
- Create: `packages/ui/src/components/ui/use-dismissable.ts`
- Create: `packages/ui/src/components/ui/use-dismissable.test.tsx`
- Create: `packages/ui/src/components/ui/scrim.tsx`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Produces: `useDismissable({ open, onDismiss }): { containerRef }` and `<Scrim open onDismiss />`. Tasks 5, 6, 11, 12 and 13 all consume these.

- [ ] **Step 1: Add the test environment**

In `packages/ui/package.json`, add to `devDependencies` (create the block if absent):

```json
  "devDependencies": {
    "happy-dom": "^20.10.6"
  }
```

Create `packages/ui/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Per-file `@vitest-environment` pragmas still win; this is the default for
    // component tests, while token tests keep using node.
    environment: "node"
  }
});
```

Run: `pnpm install`

- [ ] **Step 2: Write the failing test**

Create `packages/ui/src/components/ui/use-dismissable.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useDismissable } from "./use-dismissable";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const Panel = ({ open, onDismiss }: { open: boolean; onDismiss: () => void }) => {
  const { containerRef } = useDismissable({ open, onDismiss });
  return (
    <div ref={containerRef}>
      <button type="button">inside</button>
    </div>
  );
};

const render = async (element: React.ReactElement): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(element));
  return container;
};

describe("useDismissable", () => {
  it("dismisses on Escape while open", async () => {
    const onDismiss = vi.fn();
    await render(<Panel open onDismiss={onDismiss} />);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("ignores Escape while closed", async () => {
    const onDismiss = vi.fn();
    await render(<Panel open={false} onDismiss={onDismiss} />);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("moves focus into the panel on open and restores it on close", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const onDismiss = vi.fn();

    await render(<Panel open onDismiss={onDismiss} />);
    expect(document.activeElement?.textContent).toBe("inside");

    await act(async () => root?.render(<Panel open={false} onDismiss={onDismiss} />));
    expect(document.activeElement).toBe(opener);

    opener.remove();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @thinkbrain/ui test`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `useDismissable`**

```tsx
import { useEffect, useRef } from "react";

/**
 * Escape-to-dismiss and focus handling shared by the drawer and every sheet.
 *
 * Focus moves to the first focusable element inside the panel when it opens and
 * returns to whatever was focused before, so a phone user who dismisses a sheet
 * lands back on the control that opened it rather than at the top of the page.
 */
export function useDismissable({
  open,
  onDismiss
}: {
  readonly open: boolean;
  readonly onDismiss: () => void;
}): { readonly containerRef: React.RefObject<HTMLDivElement | null> } {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      onDismiss();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onDismiss]);

  useEffect(() => {
    if (!open) {
      const restore = restoreFocusRef.current;
      restoreFocusRef.current = null;
      restore?.focus();
      return;
    }
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = containerRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusable?.focus();
  }, [open]);

  return { containerRef };
}
```

- [ ] **Step 5: Implement `Scrim`**

Create `packages/ui/src/components/ui/scrim.tsx`:

```tsx
import { cn } from "../../lib/utils";

/**
 * Dimmed backdrop behind an overlay surface.
 *
 * Presentational and inert to assistive tech — the surface it sits behind owns
 * the dialog semantics. Tapping it dismisses.
 */
export function Scrim({
  open,
  onDismiss,
  className
}: {
  readonly open: boolean;
  readonly onDismiss: () => void;
  readonly className?: string;
}) {
  if (!open) return null;
  return (
    <div
      aria-hidden="true"
      className={cn("absolute inset-0 z-40 bg-overlay", className)}
      onClick={onDismiss}
    />
  );
}
```

- [ ] **Step 6: Export both**

In `packages/ui/src/index.ts`:

```ts
export { useDismissable } from "./components/ui/use-dismissable";
export { Scrim } from "./components/ui/scrim";
```

- [ ] **Step 7: Run tests and QA**

Run: `pnpm --filter @thinkbrain/ui test && pnpm qa`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): add dismissable overlay behaviour and scrim primitive"
```

---

### Task 5: `Drawer`

Navigation chrome peeks: 86% wide, max 300px, over a scrim. Distinct on purpose from a revealed panel, which takes the full width (Task 10).

**Files:**
- Create: `packages/ui/src/components/ui/drawer.tsx`
- Create: `packages/ui/src/components/ui/drawer.test.tsx`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Consumes: `useDismissable`, `Scrim` (Task 4).
- Produces: `<Drawer open onDismiss label>{children}</Drawer>`.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Drawer } from "./drawer";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const render = async (element: React.ReactElement): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(element));
  return container;
};

describe("Drawer", () => {
  it("renders nothing while closed", async () => {
    const host = await render(
      <Drawer open={false} onDismiss={() => undefined} label="Navigation">
        <button type="button">Files</button>
      </Drawer>
    );

    expect(host.querySelector('[aria-label="Navigation"]')).toBeNull();
  });

  it("exposes its content as a labelled dialog when open", async () => {
    const host = await render(
      <Drawer open onDismiss={() => undefined} label="Navigation">
        <button type="button">Files</button>
      </Drawer>
    );

    const panel = host.querySelector('[aria-label="Navigation"]');
    expect(panel?.getAttribute("role")).toBe("dialog");
    expect(panel?.getAttribute("aria-modal")).toBe("true");
    expect(panel?.textContent).toContain("Files");
  });

  it("dismisses when the scrim is tapped", async () => {
    const onDismiss = vi.fn();
    const host = await render(
      <Drawer open onDismiss={onDismiss} label="Navigation">
        <button type="button">Files</button>
      </Drawer>
    );

    const scrim = host.querySelector('[aria-hidden="true"]');
    await act(async () => {
      scrim?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @thinkbrain/ui test -- drawer`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `Drawer`**

```tsx
import type { ReactNode } from "react";

import { cn } from "../../lib/utils";
import { Scrim } from "./scrim";
import { useDismissable } from "./use-dismissable";

/**
 * Edge-anchored navigation overlay.
 *
 * Deliberately narrower than the viewport (86%, capped at 300px): navigation
 * chrome peeks so it reads as something you tap out of, while content surfaces
 * take the full width. That contrast is the phone shell's main orientation cue.
 */
export function Drawer({
  open,
  onDismiss,
  label,
  className,
  children
}: {
  readonly open: boolean;
  readonly onDismiss: () => void;
  readonly label: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const { containerRef } = useDismissable({ open, onDismiss });
  if (!open) return null;
  return (
    <>
      <Scrim open onDismiss={onDismiss} />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={cn(
          "absolute inset-y-0 left-0 z-50 flex w-[86%] max-w-[300px] flex-col overflow-y-auto bg-sidebar text-sidebar-foreground shadow-panel",
          className
        )}
      >
        {children}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Export it**

```ts
export { Drawer } from "./components/ui/drawer";
```

- [ ] **Step 5: Run tests and QA**

Run: `pnpm --filter @thinkbrain/ui test && pnpm qa`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): add navigation drawer primitive"
```

---

### Task 6: `BottomSheet`

The surface behind the tab count, `⋯`, and the phone's bottom panel.

**Files:**
- Create: `packages/ui/src/components/ui/bottom-sheet.tsx`
- Create: `packages/ui/src/components/ui/bottom-sheet.test.tsx`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Consumes: `useDismissable`, `Scrim` (Task 4).
- Produces: `<BottomSheet open onDismiss label>{children}</BottomSheet>`.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BottomSheet } from "./bottom-sheet";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const render = async (element: React.ReactElement): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(element));
  return container;
};

describe("BottomSheet", () => {
  it("renders nothing while closed", async () => {
    const host = await render(
      <BottomSheet open={false} onDismiss={() => undefined} label="Open tabs">
        <p>content</p>
      </BottomSheet>
    );

    expect(host.querySelector('[aria-label="Open tabs"]')).toBeNull();
  });

  it("exposes its content as a labelled dialog when open", async () => {
    const host = await render(
      <BottomSheet open onDismiss={() => undefined} label="Open tabs">
        <p>content</p>
      </BottomSheet>
    );

    const panel = host.querySelector('[aria-label="Open tabs"]');
    expect(panel?.getAttribute("role")).toBe("dialog");
    expect(panel?.textContent).toContain("content");
  });

  it("dismisses on Escape", async () => {
    const onDismiss = vi.fn();
    await render(
      <BottomSheet open onDismiss={onDismiss} label="Open tabs">
        <button type="button">close me</button>
      </BottomSheet>
    );

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @thinkbrain/ui test -- bottom-sheet`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `BottomSheet`**

```tsx
import type { ReactNode } from "react";

import { cn } from "../../lib/utils";
import { Scrim } from "./scrim";
import { useDismissable } from "./use-dismissable";

/**
 * Bottom-anchored overlay surface.
 *
 * Capped at 80% height so the surface underneath stays partly visible — the
 * sheet is about the document you can still see, not a new screen.
 */
export function BottomSheet({
  open,
  onDismiss,
  label,
  className,
  children
}: {
  readonly open: boolean;
  readonly onDismiss: () => void;
  readonly label: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const { containerRef } = useDismissable({ open, onDismiss });
  if (!open) return null;
  return (
    <>
      <Scrim open onDismiss={onDismiss} />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={cn(
          "absolute inset-x-0 bottom-0 z-50 flex max-h-[80%] flex-col overflow-y-auto rounded-t-lg bg-panel text-panel-foreground pb-[env(safe-area-inset-bottom)] shadow-panel",
          className
        )}
      >
        {children}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Export it**

```ts
export { BottomSheet } from "./components/ui/bottom-sheet";
```

- [ ] **Step 5: Run tests and QA**

Run: `pnpm --filter @thinkbrain/ui test && pnpm qa`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): add bottom sheet primitive"
```

---

### Task 7: `BottomNav`

The presentational shell of the hub. It knows nothing about panels or commands — Task 8 resolves those and hands it rendered items.

**Files:**
- Create: `packages/ui/src/components/ui/bottom-nav.tsx`
- Create: `packages/ui/src/components/ui/bottom-nav.test.tsx`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Produces:

```ts
export interface BottomNavItem {
  readonly key: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly active?: boolean;
  readonly badge?: number;
  readonly onSelect: () => void;
  readonly onLongPress?: () => void;
}
```

`<BottomNav items={…} label="Primary" />`. Task 8 builds the items; Task 14 supplies `onLongPress`.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BottomNav, type BottomNavItem } from "./bottom-nav";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const render = async (element: React.ReactElement): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(element));
  return container;
};

const item = (overrides: Partial<BottomNavItem> = {}): BottomNavItem => ({
  key: "files",
  label: "Files",
  icon: <span>icon</span>,
  onSelect: () => undefined,
  ...overrides
});

describe("BottomNav", () => {
  it("renders a labelled button per item", async () => {
    const host = await render(
      <BottomNav label="Primary" items={[item(), item({ key: "search", label: "Search" })]} />
    );

    expect(host.querySelector('[aria-label="Files"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Search"]')).not.toBeNull();
  });

  it("shows the label as visible text, not only as an aria-label", async () => {
    const host = await render(<BottomNav label="Primary" items={[item()]} />);

    expect(host.textContent).toContain("Files");
  });

  it("marks the active item for assistive tech", async () => {
    const host = await render(
      <BottomNav label="Primary" items={[item({ active: true })]} />
    );

    expect(host.querySelector('[aria-label="Files"]')?.getAttribute("aria-current")).toBe("page");
  });

  it("renders a badge count when one is supplied", async () => {
    const host = await render(
      <BottomNav label="Primary" items={[item({ key: "sync", label: "Sync", badge: 3 })]} />
    );

    expect(host.querySelector('[aria-label="Sync"]')?.textContent).toContain("3");
  });

  it("calls onSelect when tapped", async () => {
    const onSelect = vi.fn();
    const host = await render(<BottomNav label="Primary" items={[item({ onSelect })]} />);

    await act(async () => {
      host.querySelector<HTMLButtonElement>('[aria-label="Files"]')?.click();
    });

    expect(onSelect).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @thinkbrain/ui test -- bottom-nav`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `BottomNav`**

```tsx
import { useRef, type ReactNode } from "react";

import { cn } from "../../lib/utils";

/** One hub slot. Resolution from panels and commands happens outside this component. */
export interface BottomNavItem {
  readonly key: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly active?: boolean;
  readonly badge?: number;
  readonly onSelect: () => void;
  readonly onLongPress?: () => void;
}

/** Press-and-hold threshold, in milliseconds, before a tap becomes a long press. */
const LONG_PRESS_MS = 500;

/**
 * Bottom navigation hub.
 *
 * Labels are visible text, not `aria-label` alone: the icon rail this replaces
 * relied on hover to teach its glyphs, and a phone has no hover.
 */
export function BottomNav({
  items,
  label,
  className
}: {
  readonly items: readonly BottomNavItem[];
  readonly label: string;
  readonly className?: string;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);

  const clear = (): void => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  return (
    <nav
      aria-label={label}
      className={cn(
        "flex shrink-0 items-stretch justify-around border-t border-border bg-statusbar pb-[env(safe-area-inset-bottom)]",
        className
      )}
    >
      {items.map((entry) => (
        <button
          key={entry.key}
          type="button"
          aria-label={entry.label}
          aria-current={entry.active ? "page" : undefined}
          className={cn(
            "relative flex min-h-14 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 border-0 bg-transparent px-1 text-[0.65rem] font-medium text-muted-foreground focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:min-h-14",
            entry.active && "text-activitybar-active"
          )}
          onPointerDown={() => {
            if (!entry.onLongPress) return;
            firedRef.current = false;
            timerRef.current = setTimeout(() => {
              firedRef.current = true;
              entry.onLongPress?.();
            }, LONG_PRESS_MS);
          }}
          onPointerUp={clear}
          onPointerLeave={clear}
          onPointerCancel={clear}
          onClick={() => {
            // A completed long press already acted; don't also run the tap.
            if (firedRef.current) {
              firedRef.current = false;
              return;
            }
            entry.onSelect();
          }}
        >
          <span aria-hidden="true" className="flex items-center justify-center">
            {entry.icon}
          </span>
          <span className="truncate">{entry.label}</span>
          {entry.badge !== undefined && entry.badge > 0 && (
            <span className="absolute top-1.5 right-[22%] rounded-full bg-danger px-1.5 text-[0.6rem] font-bold text-danger-foreground">
              {entry.badge}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}
```

- [ ] **Step 4: Export it**

```ts
export { BottomNav } from "./components/ui/bottom-nav";
export type { BottomNavItem } from "./components/ui/bottom-nav";
```

- [ ] **Step 5: Run tests and QA**

Run: `pnpm --filter @thinkbrain/ui test && pnpm qa`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): add bottom navigation primitive"
```

---

### Task 8: Hub model and resolver

A pure function over the two registries. No `side: "bottom"` exists — the hub holds pointers to panels that live left or right, so nothing in the panel registry changes.

**Files:**
- Create: `apps/desktop/src/shell/phone/hubModel.ts`
- Create: `apps/desktop/src/shell/phone/hubModel.test.ts`

**Interfaces:**
- Consumes: `DesktopPanelContribution` and `DesktopPanelId` from `panels/panelRegistryModel`, `DesktopCommand` and `DesktopCommandId` from `commands/commandRegistry`.
- Produces: `HubItem`, `ResolvedHubItem`, `DEFAULT_HUB_ITEMS`, `resolveHubItems`, `parseHubItems`, `serializeHubItems`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import {
  DEFAULT_HUB_ITEMS,
  parseHubItems,
  resolveHubItems,
  serializeHubItems,
  type HubItem
} from "./hubModel";

const panels = [
  { id: "explorer", label: "Files", icon: "files", side: "left" as const },
  { id: "assistant", label: "Assistant", icon: "assistant", side: "right" as const }
];
const commands = [{ id: "new-note", title: "New note", icon: "plus" }];

const context = {
  panels,
  commands,
  activeLeftPanel: "explorer" as string | null,
  activeRightPanel: null as string | null,
  badges: { explorer: 2 }
};

describe("resolveHubItems", () => {
  it("takes a panel item's label, icon, badge and active state from the registry", () => {
    const [resolved] = resolveHubItems([{ kind: "panel", id: "explorer" }], context);

    expect(resolved).toMatchObject({
      kind: "panel",
      label: "Files",
      icon: "files",
      badge: 2,
      active: true
    });
  });

  it("takes a command item's label and icon from the command, and is never active", () => {
    const [resolved] = resolveHubItems([{ kind: "command", id: "new-note" }], context);

    expect(resolved).toMatchObject({ kind: "command", label: "New note", icon: "plus", active: false });
  });

  it("always resolves the menu item", () => {
    const [resolved] = resolveHubItems([{ kind: "menu" }], context);

    expect(resolved).toMatchObject({ kind: "menu", label: "Menu", active: false });
  });

  it("skips a panel whose extension is not registered, keeping the pin's neighbours", () => {
    const items: readonly HubItem[] = [
      { kind: "panel", id: "journal-calendar.journal" },
      { kind: "menu" }
    ];

    const resolved = resolveHubItems(items, context);

    expect(resolved.map((entry) => entry.kind)).toEqual(["menu"]);
  });

  it("skips a command with no icon, because the hub has nothing to draw", () => {
    const resolved = resolveHubItems([{ kind: "command", id: "open-file" }], {
      ...context,
      commands: [{ id: "open-file", title: "Open file" }]
    });

    expect(resolved).toEqual([]);
  });

  it("marks a right-side panel active from the right panel selection", () => {
    const [resolved] = resolveHubItems([{ kind: "panel", id: "assistant" }], {
      ...context,
      activeRightPanel: "assistant"
    });

    expect(resolved?.active).toBe(true);
  });
});

describe("parseHubItems", () => {
  it("falls back to the defaults for an empty setting", () => {
    expect(parseHubItems("")).toEqual(DEFAULT_HUB_ITEMS);
  });

  it("falls back to the defaults for malformed JSON rather than throwing", () => {
    expect(parseHubItems("{ not json")).toEqual(DEFAULT_HUB_ITEMS);
  });

  it("drops entries with an unknown kind", () => {
    expect(parseHubItems('[{"kind":"panel","id":"explorer"},{"kind":"nope"}]')).toEqual([
      { kind: "panel", id: "explorer" }
    ]);
  });

  it("round-trips through serializeHubItems", () => {
    expect(parseHubItems(serializeHubItems(DEFAULT_HUB_ITEMS))).toEqual(DEFAULT_HUB_ITEMS);
  });
});

describe("DEFAULT_HUB_ITEMS", () => {
  it("ends with the menu, which is not removable", () => {
    expect(DEFAULT_HUB_ITEMS.at(-1)).toEqual({ kind: "menu" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @thinkbrain/desktop test -- hubModel`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the model**

```ts
import type { DesktopCommandId } from "../../commands/commandRegistry";
import type { DesktopPanelId } from "../../panels/panelRegistryModel";

/**
 * One slot in the phone's bottom hub.
 *
 * A `side: "bottom"` panel contribution was rejected: `side` says where a panel
 * lives and renders, while the hub holds *pointers* to panels that live left or
 * right. Making the assistant bottom-sided would remove it from the top-right
 * action-items menu. Keeping the hub a list of targets means the panel registry,
 * `Popout`, and the side-narrowed contribution union are all untouched, and
 * extensions become hub-reachable with no extension-API change.
 */
export type HubItem =
  | { readonly kind: "panel"; readonly id: DesktopPanelId }
  | { readonly kind: "command"; readonly id: DesktopCommandId }
  | { readonly kind: "menu" };

/** A hub item with its presentation resolved from the live registries. */
export interface ResolvedHubItem {
  readonly key: string;
  readonly kind: HubItem["kind"];
  readonly label: string;
  readonly icon: string;
  readonly badge?: number;
  /** Only ever true for panel items — a command fires and returns. */
  readonly active: boolean;
  readonly target: HubItem;
}

/** Minimal shapes the resolver needs; keeps it testable without the registries. */
interface HubPanel {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly side: "left" | "right";
}
interface HubCommand {
  readonly id: string;
  readonly title: string;
  readonly icon?: string;
}

export interface HubContext {
  readonly panels: readonly HubPanel[];
  readonly commands: readonly HubCommand[];
  readonly activeLeftPanel: string | null;
  readonly activeRightPanel: string | null;
  readonly badges: Readonly<Record<string, number>>;
}

/**
 * The out-of-the-box hub.
 *
 * Files and Search are left panels, the assistant is a right panel, and the hub
 * does not care which — activating either is a reveal. There is no "Home": the
 * first slot is a shortcut whose label comes from its target's registration.
 */
export const DEFAULT_HUB_ITEMS: readonly HubItem[] = [
  { kind: "panel", id: "explorer" },
  { kind: "panel", id: "search" },
  { kind: "command", id: "new-note" },
  { kind: "panel", id: "assistant" },
  { kind: "menu" }
];

/** Icon identifier for the drawer slot; resolved through `panelIcons` like any other. */
const MENU_ICON = "menu";

export function resolveHubItems(
  items: readonly HubItem[],
  context: HubContext
): readonly ResolvedHubItem[] {
  const resolved: ResolvedHubItem[] = [];

  for (const [index, item] of items.entries()) {
    if (item.kind === "menu") {
      resolved.push({
        key: `menu-${index}`,
        kind: "menu",
        label: "Menu",
        icon: MENU_ICON,
        active: false,
        target: item
      });
      continue;
    }

    if (item.kind === "panel") {
      const panel = context.panels.find((candidate) => candidate.id === item.id);
      // An unregistered id is skipped, never repaired: an extension that is
      // merely deactivated must not silently lose its pin.
      if (!panel) continue;
      const activeId = panel.side === "left" ? context.activeLeftPanel : context.activeRightPanel;
      resolved.push({
        key: `panel-${panel.id}`,
        kind: "panel",
        label: panel.label,
        icon: panel.icon,
        badge: context.badges[panel.id],
        active: activeId === panel.id,
        target: item
      });
      continue;
    }

    const command = context.commands.find((candidate) => candidate.id === item.id);
    // A command with no icon has nothing to draw in a five-slot bar.
    if (!command?.icon) continue;
    resolved.push({
      key: `command-${command.id}`,
      kind: "command",
      label: command.title,
      icon: command.icon,
      active: false,
      target: item
    });
  }

  return resolved;
}

/** Narrows one parsed entry, dropping anything that is not a well-formed item. */
const asHubItem = (value: unknown): HubItem | null => {
  if (typeof value !== "object" || value === null) return null;
  const entry = value as { kind?: unknown; id?: unknown };
  if (entry.kind === "menu") return { kind: "menu" };
  if (typeof entry.id !== "string" || entry.id.length === 0) return null;
  if (entry.kind === "panel") return { kind: "panel", id: entry.id };
  if (entry.kind === "command") return { kind: "command", id: entry.id };
  return null;
};

/**
 * Reads the persisted hub.
 *
 * Falls back to the defaults rather than throwing: a corrupt preference must
 * not cost the user their only means of navigating the app.
 */
export function parseHubItems(raw: string): readonly HubItem[] {
  if (raw.trim().length === 0) return DEFAULT_HUB_ITEMS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_HUB_ITEMS;
    const items = parsed.map(asHubItem).filter((item): item is HubItem => item !== null);
    return items.length > 0 ? items : DEFAULT_HUB_ITEMS;
  } catch {
    return DEFAULT_HUB_ITEMS;
  }
}

export function serializeHubItems(items: readonly HubItem[]): string {
  return JSON.stringify(items);
}
```

- [ ] **Step 4: Add the `menu` icon**

`resolveHubItems` returns `"menu"` as an icon identifier, and `panelIcons` has no such entry. In `apps/desktop/src/shell/panelIconsModel.ts`, add `Menu` to the lucide import list and to the map under the "Settings + chrome" group:

```ts
  menu: Menu,
```

- [ ] **Step 5: Run tests and QA**

Run: `pnpm --filter @thinkbrain/desktop test -- hubModel && pnpm qa`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/shell/phone/hubModel.ts apps/desktop/src/shell/phone/hubModel.test.ts apps/desktop/src/shell/panelIconsModel.ts
git commit -m "feat(shell): add mobile hub model and resolver"
```

---

### Task 9: Persist the hub as a setting

`SettingType` has no list or JSON member, and adding one would touch validation, import/export, the control registry and settings search. Follow the `journal.fieldDefinitions` precedent instead: a `string` holding JSON.

**Files:**
- Create: `packages/core/src/settings/modules/ui.ts`
- Modify: `packages/core/src/settings/modules/index.ts`
- Modify: `packages/core/src/index.ts` — export `uiModule` if the other modules are exported there
- Create: `apps/desktop/src/shell/phone/useHubItems.ts`
- Create: `apps/desktop/src/shell/phone/useHubItems.test.tsx`

**Interfaces:**
- Consumes: `parseHubItems`, `serializeHubItems`, `HubItem` (Task 8); `useSettingsStore` with `getEffectiveValue(key)` / `setSettingImmediately(key, value)`.
- Produces: `useHubItems(): { items, setItems }` reading and writing the full key `ui.mobileHub`.

- [ ] **Step 1: Write the failing test for the module**

Create `packages/core/src/settings/modules/ui.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createSettingsRegistry } from "../registry";
import { uiModule } from "./ui";

describe("uiModule", () => {
  it("registers the hub under the full key ui.mobileHub", () => {
    const registry = createSettingsRegistry();
    registry.registerModule(uiModule);

    const definition = registry.getDefinition("ui.mobileHub");

    expect(definition?.type).toBe("string");
    // Empty means "use the built-in defaults", which live in the desktop layer
    // so that panel ids stay out of platform-agnostic core.
    expect(definition?.default).toBe("");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @thinkbrain/core test -- ui`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the settings module**

```ts
/**
 * Built-in UI module.
 *
 * Scope is `"app"`: which shortcuts sit in the phone's bottom hub is a property
 * of the person, not of the vault they happen to have open.
 */

import type { SettingsModule } from "../types";

/** Control key for the hub editor rendered by the desktop layer. */
export const MOBILE_HUB_CONTROL = "mobile-hub-items";

export const uiModule: SettingsModule = {
  id: "ui",
  label: "Interface",
  scope: "app",
  sections: [
    {
      id: "ui.mobile",
      label: "Mobile",
      settings: [
        {
          key: "mobileHub",
          // `SettingType` has no list or JSON member and this work does not add
          // one — that would touch validation, import/export, the control
          // registry and settings search. Same shape as journal.fieldDefinitions.
          type: "string",
          default: "",
          scope: "app",
          section: "ui.mobile",
          control: MOBILE_HUB_CONTROL,
          label: "Bottom bar shortcuts",
          description:
            "Shortcuts shown in the bottom bar on phones. Leave empty to use the defaults.",
          validation: (value): string | null => {
            if (typeof value !== "string") return "Bottom bar shortcuts must be text.";
            if (value.trim().length === 0) return null;
            try {
              return Array.isArray(JSON.parse(value))
                ? null
                : "Bottom bar shortcuts must be a list.";
            } catch {
              return "Bottom bar shortcuts must be valid JSON.";
            }
          }
        }
      ]
    }
  ]
};
```

- [ ] **Step 4: Export and register it**

In `packages/core/src/settings/modules/index.ts`:

```ts
export { MOBILE_HUB_CONTROL, uiModule } from "./ui";
```

Then find where the built-in modules are registered:

Run: `grep -rn "appearanceModule" apps/desktop/src packages/core/src --include=*.ts --include=*.tsx | grep -v test`

Add `uiModule` alongside `appearanceModule` at each registration site, and add it to `packages/core/src/index.ts` if the other modules are re-exported there.

- [ ] **Step 5: Write the failing test for the hook**

Create `apps/desktop/src/shell/phone/useHubItems.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_HUB_ITEMS } from "./hubModel";
import { useHubItems } from "./useHubItems";

const setSettingImmediately = vi.fn(async () => undefined);
let stored = "";

vi.mock("../../settings/settingsStore", () => ({
  useSettingsStore: Object.assign(
    (selector: (state: unknown) => unknown) =>
      selector({ getEffectiveValue: () => stored, setSettingImmediately }),
    { getState: () => ({ getEffectiveValue: () => stored, setSettingImmediately }) }
  )
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  setSettingImmediately.mockClear();
  stored = "";
  root = null;
  container = null;
});

const renderHook = async (): Promise<() => ReturnType<typeof useHubItems>> => {
  let latest: ReturnType<typeof useHubItems> | null = null;
  const Probe = (): null => {
    latest = useHubItems();
    return null;
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<Probe />));
  return () => {
    if (!latest) throw new Error("useHubItems did not render");
    return latest;
  };
};

describe("useHubItems", () => {
  it("returns the defaults when nothing is stored", async () => {
    const hook = await renderHook();

    expect(hook().items).toEqual(DEFAULT_HUB_ITEMS);
  });

  it("writes serialized items to ui.mobileHub", async () => {
    const hook = await renderHook();

    await act(async () => hook().setItems([{ kind: "menu" }]));

    expect(setSettingImmediately).toHaveBeenCalledWith("ui.mobileHub", '[{"kind":"menu"}]');
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter @thinkbrain/desktop test -- useHubItems`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement the hook**

```ts
import { useCallback, useMemo } from "react";

import { useSettingsStore } from "../../settings/settingsStore";
import { parseHubItems, serializeHubItems, type HubItem } from "./hubModel";

/** Full settings key: module id `ui` plus relative key `mobileHub`. */
export const MOBILE_HUB_KEY = "ui.mobileHub";

/**
 * The user's bottom-hub shortcuts, read through the settings store.
 *
 * Writes go through `setSettingImmediately` rather than the staged path: pinning
 * a shortcut is a direct manipulation, and there is no Save button in reach on a
 * phone.
 */
export function useHubItems(): {
  readonly items: readonly HubItem[];
  readonly setItems: (items: readonly HubItem[]) => Promise<void>;
} {
  const raw = useSettingsStore((state) => state.getEffectiveValue(MOBILE_HUB_KEY));
  const items = useMemo(
    () => parseHubItems(typeof raw === "string" ? raw : ""),
    [raw]
  );
  const setItems = useCallback(async (next: readonly HubItem[]) => {
    await useSettingsStore
      .getState()
      .setSettingImmediately(MOBILE_HUB_KEY, serializeHubItems(next));
  }, []);
  return { items, setItems };
}
```

- [ ] **Step 8: Run tests and QA**

Run: `pnpm --filter @thinkbrain/core test && pnpm --filter @thinkbrain/desktop test && pnpm qa`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/settings/modules/ui.ts packages/core/src/settings/modules/ui.test.ts packages/core/src/settings/modules/index.ts packages/core/src/index.ts apps/desktop/src/shell/phone/useHubItems.ts apps/desktop/src/shell/phone/useHubItems.test.tsx
git add -u
git commit -m "feat(settings): persist mobile hub shortcuts under ui.mobileHub"
```

---

### Task 10: `PhoneShell` — header, drawer, hub

The first task with a user-visible phone result. Kept to four small files so none approaches the size limit.

**Files:**
- Create: `apps/desktop/src/shell/phone/PhoneHeader.tsx`
- Create: `apps/desktop/src/shell/phone/PhoneDrawer.tsx`
- Create: `apps/desktop/src/shell/phone/PhoneHub.tsx`
- Create: `apps/desktop/src/shell/phone/PhoneShell.tsx`
- Create: `apps/desktop/src/shell/phone/PhoneShell.test.tsx`
- Modify: `apps/desktop/src/shell/ShellRoot.tsx`
- Modify: `apps/desktop/src/shell/ShellRoot.test.tsx`

**Interfaces:**
- Consumes: `ShellState` (Task 1), `usePhoneChrome` (Task 2), `Drawer`/`BottomNav` (Tasks 5, 7), `resolveHubItems`/`useHubItems` (Tasks 8, 9), `useLeftPanelContributions`, `PanelIcon` from `shell/panelIcons.tsx`, `LeftPopout`, `TabContent`.
- Produces: `<PhoneShell shell={…} />`.

**Surface rules this task establishes.** Navigation chrome peeks — the drawer is 86%/300px over a scrim. Content takes over — a revealed panel fills the width between header and hub. The hub stays visible over a revealed panel; that is what makes it a hub rather than a home screen.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { PhoneShell } from "./PhoneShell";
import { useShellState } from "../useShellState";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

/** Mounts PhoneShell over real shell state, as ShellRoot does. */
const render = async (): Promise<HTMLDivElement> => {
  const Host = () => <PhoneShell shell={useShellState()} />;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<Host />));
  return container;
};

const click = async (host: HTMLDivElement, label: string): Promise<void> => {
  await act(async () => {
    host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)?.click();
  });
};

describe("PhoneShell", () => {
  it("renders no activity rail", async () => {
    const host = await render();

    expect(host.querySelector('[aria-label="Workspace sections"]')).toBeNull();
  });

  it("shows the hub with visible labels rather than icon-only buttons", async () => {
    const host = await render();

    expect(host.querySelector('[aria-label="Primary navigation"]')?.textContent).toContain("Files");
  });

  it("opens the drawer from the header menu button", async () => {
    const host = await render();
    expect(host.querySelector('[aria-label="Navigation"]')).toBeNull();

    await click(host, "Open navigation");

    expect(host.querySelector('[aria-label="Navigation"]')).not.toBeNull();
  });

  it("opens the same drawer from the hub Menu slot", async () => {
    const host = await render();

    await click(host, "Menu");

    expect(host.querySelector('[aria-label="Navigation"]')).not.toBeNull();
  });

  it("lists every registered left panel in the drawer with a visible label", async () => {
    const host = await render();

    await click(host, "Open navigation");

    const drawer = host.querySelector('[aria-label="Navigation"]');
    expect(drawer?.textContent).toContain("Files");
    expect(drawer?.textContent).toContain("Search");
    expect(drawer?.textContent).toContain("Settings");
  });

  it("closes the drawer after choosing a panel and reveals it full width", async () => {
    const host = await render();
    await click(host, "Open navigation");

    await click(host, "Search");

    expect(host.querySelector('[aria-label="Navigation"]')).toBeNull();
    expect(host.querySelector('[aria-label="Search panel"]')).not.toBeNull();
  });

  it("keeps the hub visible while a panel is revealed", async () => {
    const host = await render();

    await click(host, "Search");

    expect(host.querySelector('[aria-label="Search panel"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Primary navigation"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @thinkbrain/desktop test -- PhoneShell`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `PhoneHeader`**

```tsx
import { ArrowLeft, Menu as MenuIcon, MoreHorizontal } from "lucide-react";

/**
 * Universal phone header.
 *
 * The two right-hand controls open different surfaces: the count opens the tab
 * switcher, `⋯` opens the inspector sheet. Only the left slot and the hub's Menu
 * slot open the navigation drawer.
 */
export function PhoneHeader({
  title,
  canGoBack,
  tabCount,
  onBack,
  onOpenNavigation,
  onOpenTabs,
  onOpenInspector
}: {
  readonly title: string;
  readonly canGoBack: boolean;
  readonly tabCount: number;
  readonly onBack: () => void;
  readonly onOpenNavigation: () => void;
  readonly onOpenTabs: () => void;
  readonly onOpenInspector: () => void;
}) {
  const button =
    "flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-small border-0 bg-transparent text-titlebar-foreground focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring";
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-1 border-b border-border bg-titlebar px-1">
      {canGoBack ? (
        <button type="button" aria-label="Back" className={button} onClick={onBack}>
          <ArrowLeft aria-hidden="true" className="size-5" />
        </button>
      ) : (
        <button
          type="button"
          aria-label="Open navigation"
          className={button}
          onClick={onOpenNavigation}
        >
          <MenuIcon aria-hidden="true" className="size-5" />
        </button>
      )}

      <h1 className="min-w-0 flex-1 truncate text-center text-sm font-semibold">{title}</h1>

      <div className="flex shrink-0 items-center">
        <button
          type="button"
          aria-label={`Open tabs (${tabCount})`}
          className={button}
          onClick={onOpenTabs}
        >
          <span
            aria-hidden="true"
            className="flex size-6 items-center justify-center rounded-small border-2 border-current text-[0.7rem] font-bold"
          >
            {tabCount}
          </span>
        </button>
        <button
          type="button"
          aria-label="Document tools"
          className={button}
          onClick={onOpenInspector}
        >
          <MoreHorizontal aria-hidden="true" className="size-5" />
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Implement `PhoneDrawer`**

```tsx
import { Drawer } from "@thinkbrain/ui";

import { PanelIcon } from "../panelIcons";
import { useLeftPanelContributions } from "../../panels/panelRegistryModel";
import type { LeftPanel } from "../shellTypes";

/**
 * The phone's navigation drawer.
 *
 * Renders `useLeftPanelContributions()` — the same source the desktop rail reads
 * — so entries, active state and badges have one definition, not two. The labels
 * the rail keeps in `aria-label` become visible text here, because a phone has
 * no hover to teach an unlabelled glyph.
 */
export function PhoneDrawer({
  open,
  activePanel,
  badges,
  workspaceName,
  onDismiss,
  onSelectPanel,
  onOpenSettings,
  onLongPressPanel
}: {
  readonly open: boolean;
  readonly activePanel: LeftPanel | null;
  readonly badges: Readonly<Record<string, number>>;
  readonly workspaceName: string | null;
  readonly onDismiss: () => void;
  readonly onSelectPanel: (panel: LeftPanel) => void;
  readonly onOpenSettings: () => void;
  readonly onLongPressPanel?: (panel: LeftPanel) => void;
}) {
  const panels = useLeftPanelContributions();
  const row =
    "flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-small border-0 bg-transparent px-3 text-left text-sm text-sidebar-foreground hover:bg-accent focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:min-h-12";

  return (
    <Drawer open={open} onDismiss={onDismiss} label="Navigation">
      <div className="border-b border-border px-4 py-3">
        <p className="truncate text-sm font-bold">{workspaceName ?? "No workspace open"}</p>
      </div>

      <div className="flex flex-1 flex-col gap-0.5 p-2">
        {panels.map((panel) => (
          <button
            key={panel.id}
            type="button"
            aria-label={panel.label}
            aria-current={activePanel === panel.id ? "page" : undefined}
            className={row}
            onClick={() => onSelectPanel(panel.id)}
            onContextMenu={(event) => {
              if (!onLongPressPanel) return;
              event.preventDefault();
              onLongPressPanel(panel.id);
            }}
          >
            <PanelIcon name={panel.icon} />
            <span className="flex-1 truncate">{panel.label}</span>
            {badges[panel.id] !== undefined && badges[panel.id]! > 0 && (
              <span className="rounded-full bg-danger px-1.5 text-[0.65rem] font-bold text-danger-foreground">
                {badges[panel.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="border-t border-border p-2">
        <button type="button" aria-label="Settings" className={row} onClick={onOpenSettings}>
          <PanelIcon name="settings" />
          <span className="flex-1 truncate">Settings</span>
        </button>
      </div>
    </Drawer>
  );
}
```

- [ ] **Step 5: Implement `PhoneHub`**

```tsx
import { BottomNav, type BottomNavItem } from "@thinkbrain/ui";
import { useMemo } from "react";

import { useDesktopCommands } from "../../commands/commandRegistry";
import {
  useLeftPanelContributions,
  useRightPanelContributions
} from "../../panels/panelRegistryModel";
import { PanelIcon } from "../panelIcons";
import { resolveHubItems, type HubItem } from "./hubModel";

/**
 * Turns the persisted hub shortcuts into rendered navigation items.
 *
 * Panel targets get their label, icon, badge and active state from the panel
 * registry; command targets get label and icon from the command registry. The
 * hub itself holds only pointers, so nothing here is a second nav model.
 */
export function PhoneHub({
  items,
  activeLeftPanel,
  activeRightPanel,
  badges,
  onSelectPanel,
  onRunCommand,
  onOpenMenu,
  onLongPress
}: {
  readonly items: readonly HubItem[];
  readonly activeLeftPanel: string | null;
  readonly activeRightPanel: string | null;
  readonly badges: Readonly<Record<string, number>>;
  readonly onSelectPanel: (panelId: string) => void;
  readonly onRunCommand: (commandId: string) => void;
  readonly onOpenMenu: () => void;
  readonly onLongPress?: (item: HubItem) => void;
}) {
  const leftPanels = useLeftPanelContributions();
  const rightPanels = useRightPanelContributions();
  const commands = useDesktopCommands();

  const navItems = useMemo<readonly BottomNavItem[]>(() => {
    const resolved = resolveHubItems(items, {
      panels: [...leftPanels, ...rightPanels],
      commands,
      activeLeftPanel,
      activeRightPanel,
      badges
    });
    return resolved.map((entry) => ({
      key: entry.key,
      label: entry.label,
      icon: <PanelIcon name={entry.icon} />,
      active: entry.active,
      badge: entry.badge,
      onSelect: () => {
        if (entry.target.kind === "menu") onOpenMenu();
        else if (entry.target.kind === "panel") onSelectPanel(entry.target.id);
        else onRunCommand(entry.target.id);
      },
      onLongPress: onLongPress && entry.target.kind !== "menu"
        ? () => onLongPress(entry.target)
        : undefined
    }));
  }, [items, leftPanels, rightPanels, commands, activeLeftPanel, activeRightPanel, badges,
      onSelectPanel, onRunCommand, onOpenMenu, onLongPress]);

  return <BottomNav label="Primary navigation" items={navItems} />;
}
```

- [ ] **Step 6: Implement `PhoneShell`**

```tsx
import { useCallback, useState } from "react";

import { LeftPopout } from "../../panels/LeftPopout";
import { isBuiltInLeftPanel } from "../../panels/panelRegistryModel";
import { isSelectableRightPanel } from "../shellTypes";
import { TabContent } from "../TabContent";
import type { ShellState } from "../useShellState";
import { PhoneDrawer } from "./PhoneDrawer";
import { PhoneHeader } from "./PhoneHeader";
import { PhoneHub } from "./PhoneHub";
import { useHubItems } from "./useHubItems";

/**
 * Phone chrome over the shared shell state.
 *
 * Layout only: every piece of state here is `shell`, and every panel rendered is
 * the same component the desktop renders. What differs is the arrangement —
 * drawer instead of rail, hub instead of status bar, sheets instead of docks.
 */
export function PhoneShell({ shell }: { readonly shell: ShellState }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const { items } = useHubItems();

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const revealPanel = useCallback(
    (panelId: string) => {
      setDrawerOpen(false);
      // Toggle: tapping the hub slot you are already on returns you to the note.
      setRevealed((current) => (current === panelId ? null : panelId));
      if (isBuiltInLeftPanel(panelId)) shell.selectLeftPanel(panelId);
      else if (isSelectableRightPanel(panelId)) shell.setRightPanel(panelId);
    },
    [shell]
  );

  const runCommand = useCallback(
    (commandId: string) => {
      const command = shell.paletteCommands.find((candidate) => candidate.id === commandId);
      if (command) shell.runCommand(command);
      setDrawerOpen(false);
      setRevealed(null);
    },
    [shell]
  );

  return (
    <main
      className="relative flex h-full min-w-0 flex-col overflow-hidden bg-background text-foreground"
      aria-label="ThinkBrain mobile workspace"
    >
      <PhoneHeader
        title={shell.activeTab?.title ?? shell.workspaceName ?? "ThinkBrain"}
        canGoBack={revealed !== null}
        tabCount={shell.tabState.tabs.length}
        onBack={() => setRevealed(null)}
        onOpenNavigation={() => setDrawerOpen(true)}
        onOpenTabs={() => undefined}
        onOpenInspector={() => undefined}
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
        {revealed === null ? (
          <TabContent
            tab={shell.activeTab}
            document={shell.activeDocument}
            onChange={shell.updateDocument}
            onSave={shell.saveDocument}
            noteIndex={shell.noteIndex}
            onOpenNote={shell.onOpenNote}
            onReopenNote={shell.loadDocumentIntoView}
            unsavedNoteContents={shell.unsavedNoteContents}
          />
        ) : (
          // Content takes over: full width between header and hub, unlike the
          // drawer, which peeks at 86%.
          <LeftPopout
            panel={shell.leftPanel ?? "explorer"}
            rootPath={shell.restoredWorkspacePath}
            explorerProps={shell.explorerProps}
            onReviewConflict={shell.reviewConflict}
            versionsOf={shell.versionsOf}
            onShowEverything={shell.clearVersions}
            onOpenSearchResult={(relativePath) => {
              if (shell.restoredWorkspacePath) {
                shell.openMarkdownDocument(shell.restoredWorkspacePath, relativePath);
                setRevealed(null);
              }
            }}
          />
        )}
      </div>

      <PhoneHub
        items={items}
        activeLeftPanel={revealed}
        activeRightPanel={shell.rightPanel}
        badges={shell.conflictBadges}
        onSelectPanel={revealPanel}
        onRunCommand={runCommand}
        onOpenMenu={() => setDrawerOpen(true)}
      />

      <PhoneDrawer
        open={drawerOpen}
        activePanel={shell.leftPanel}
        badges={shell.conflictBadges}
        workspaceName={shell.workspaceName}
        onDismiss={closeDrawer}
        onSelectPanel={revealPanel}
        onOpenSettings={() => {
          shell.openSettingsTab();
          setDrawerOpen(false);
          setRevealed(null);
        }}
      />
    </main>
  );
}
```

`LeftPopout` must render full width here. If its container classes fight that, fix it in Task 13 rather than forking the component.

- [ ] **Step 7: Wire it into `ShellRoot`**

```tsx
export function ShellRoot() {
  const shell = useShellState();
  const phone = usePhoneChrome();
  return phone ? <PhoneShell shell={shell} /> : <DesktopShell shell={shell} />;
}
```

Add a matching case to `ShellRoot.test.tsx`:

```tsx
  it("renders phone chrome on a narrow touch screen", async () => {
    narrow = true;
    coarse = true;

    const host = await render();

    expect(host.querySelector('[aria-label="ThinkBrain mobile workspace"]')).not.toBeNull();
  });
```

- [ ] **Step 8: Run tests and QA**

Run: `pnpm --filter @thinkbrain/desktop test && pnpm qa`
Expected: PASS. Desktop tests must still pass untouched.

- [ ] **Step 9: Verify on a device**

Run: `pnpm android:dev`
Expected: no icon rail; hub at the bottom with visible labels; the menu button and the hub's Menu slot both open the same drawer; choosing Search reveals it full width with the hub still visible.

- [ ] **Step 10: Commit**

```bash
git add apps/desktop/src/shell/phone apps/desktop/src/shell/ShellRoot.tsx apps/desktop/src/shell/ShellRoot.test.tsx
git commit -m "feat(shell): add phone chrome with header, drawer and hub"
```

---

### Task 11: Tab switcher sheet

Tabs live in the header, browser-style, not in the hub. The desktop tab strip does not render on a phone, so this is the only way to reach a second tab.

**Files:**
- Create: `apps/desktop/src/shell/phone/TabSwitcherSheet.tsx`
- Create: `apps/desktop/src/shell/phone/TabSwitcherSheet.test.tsx`
- Modify: `apps/desktop/src/shell/phone/PhoneShell.tsx`

**Interfaces:**
- Consumes: `BottomSheet` (Task 6), `shell.tabState`, `shell.dispatchTabs`.
- Produces: `<TabSwitcherSheet open tabs activeTabId onDismiss onSelect onClose />`.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TabSwitcherSheet } from "./TabSwitcherSheet";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const tabs = [
  { id: "a", kind: "editor" as const, title: "Note A", isDirty: false },
  { id: "b", kind: "editor" as const, title: "Note B", isDirty: true }
];

const render = async (element: React.ReactElement): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(element));
  return container;
};

describe("TabSwitcherSheet", () => {
  it("lists every open tab", async () => {
    const host = await render(
      <TabSwitcherSheet
        open
        tabs={tabs}
        activeTabId="a"
        onDismiss={() => undefined}
        onSelect={() => undefined}
        onClose={() => undefined}
      />
    );

    expect(host.querySelector('[aria-label="Note A"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Note B"]')).not.toBeNull();
  });

  it("marks a tab with unsaved changes", async () => {
    const host = await render(
      <TabSwitcherSheet
        open
        tabs={tabs}
        activeTabId="a"
        onDismiss={() => undefined}
        onSelect={() => undefined}
        onClose={() => undefined}
      />
    );

    expect(host.querySelector('[aria-label="Note B"] [aria-label="Unsaved changes"]')).not.toBeNull();
  });

  it("selects a tab and dismisses itself", async () => {
    const onSelect = vi.fn();
    const onDismiss = vi.fn();
    const host = await render(
      <TabSwitcherSheet
        open
        tabs={tabs}
        activeTabId="a"
        onDismiss={onDismiss}
        onSelect={onSelect}
        onClose={() => undefined}
      />
    );

    await act(async () => {
      host.querySelector<HTMLButtonElement>('[aria-label="Note B"]')?.click();
    });

    expect(onSelect).toHaveBeenCalledWith("b");
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("closes a tab without selecting it", async () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();
    const host = await render(
      <TabSwitcherSheet
        open
        tabs={tabs}
        activeTabId="a"
        onDismiss={() => undefined}
        onSelect={onSelect}
        onClose={onClose}
      />
    );

    await act(async () => {
      host.querySelector<HTMLButtonElement>('[aria-label="Close Note B"]')?.click();
    });

    expect(onClose).toHaveBeenCalledWith("b");
    expect(onSelect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @thinkbrain/desktop test -- TabSwitcherSheet`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the sheet**

```tsx
import { BottomSheet } from "@thinkbrain/ui";
import { X } from "lucide-react";

import { cn } from "../../lib/utils";
import type { DesktopTab } from "../../tabs/tabModel";

/**
 * Open tabs, reached from the header's count button.
 *
 * The desktop tab strip does not render on a phone — a row of 116px tabs across
 * 390px is unusable — so this sheet is the only way to reach a second tab.
 */
export function TabSwitcherSheet({
  open,
  tabs,
  activeTabId,
  onDismiss,
  onSelect,
  onClose
}: {
  readonly open: boolean;
  readonly tabs: readonly DesktopTab[];
  readonly activeTabId: string | null;
  readonly onDismiss: () => void;
  readonly onSelect: (tabId: string) => void;
  readonly onClose: (tabId: string) => void;
}) {
  return (
    <BottomSheet open={open} onDismiss={onDismiss} label="Open tabs">
      <ul className="flex list-none flex-col gap-0.5 p-2">
        {tabs.map((tab) => (
          <li key={tab.id} className="flex items-center gap-1">
            <button
              type="button"
              aria-label={tab.title}
              aria-current={tab.id === activeTabId ? "page" : undefined}
              className={cn(
                "flex min-h-12 flex-1 cursor-pointer items-center gap-2 rounded-small border-0 bg-transparent px-3 text-left text-sm hover:bg-accent focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:min-h-12",
                tab.id === activeTabId && "bg-tab-active text-tab-active-foreground"
              )}
              onClick={() => {
                onSelect(tab.id);
                onDismiss();
              }}
            >
              <span className="flex-1 truncate">{tab.title}</span>
              {tab.isDirty && (
                <span
                  aria-label="Unsaved changes"
                  className="size-[0.4rem] rounded-full bg-primary"
                />
              )}
            </button>
            <button
              type="button"
              aria-label={`Close ${tab.title}`}
              className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-small border-0 bg-transparent text-muted-foreground hover:text-foreground focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
              onClick={() => onClose(tab.id)}
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </BottomSheet>
  );
}
```

- [ ] **Step 4: Wire it into `PhoneShell`**

Add state and replace the `onOpenTabs` no-op:

```tsx
  const [tabsOpen, setTabsOpen] = useState(false);
```

```tsx
        onOpenTabs={() => setTabsOpen(true)}
```

Render it beside `PhoneDrawer`:

```tsx
      <TabSwitcherSheet
        open={tabsOpen}
        tabs={shell.tabState.tabs}
        activeTabId={shell.tabState.activeTabId}
        onDismiss={() => setTabsOpen(false)}
        onSelect={(tabId) => {
          shell.dispatchTabs({ type: "activate", tabId });
          setRevealed(null);
        }}
        onClose={(tabId) => shell.dispatchTabs({ type: "requestClose", tabId })}
      />
```

- [ ] **Step 5: Run tests and QA**

Run: `pnpm --filter @thinkbrain/desktop test && pnpm qa`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/shell/phone
git commit -m "feat(shell): add phone tab switcher sheet"
```

---

### Task 12: Inspector sheet

Right panels are wholly unreachable on a phone today — `TitleBar.tsx` hides every one of their buttons under `max-[760px]:hidden`, and no story owns the fix. This is it.

**Files:**
- Create: `apps/desktop/src/shell/phone/InspectorSheet.tsx`
- Create: `apps/desktop/src/shell/phone/InspectorSheet.test.tsx`
- Modify: `apps/desktop/src/shell/phone/PhoneShell.tsx`

**Interfaces:**
- Consumes: `BottomSheet` (Task 6), `useRightPanelContributions`, `RightPopout`.
- Produces: `<InspectorSheet open panel onDismiss onSelectPanel rootPath documentContents />`.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InspectorSheet } from "./InspectorSheet";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const render = async (element: React.ReactElement): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(element));
  return container;
};

const sheet = (overrides: Record<string, unknown> = {}): React.ReactElement => (
  <InspectorSheet
    open
    panel="outline"
    rootPath={null}
    documentContents={null}
    onDismiss={() => undefined}
    onSelectPanel={() => undefined}
    {...overrides}
  />
);

describe("InspectorSheet", () => {
  it("offers every registered right panel", async () => {
    const host = await render(sheet());

    expect(host.querySelector('[aria-label="Outline"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Properties"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Assistant"]')).not.toBeNull();
  });

  it("marks the selected panel", async () => {
    const host = await render(sheet({ panel: "properties" }));

    expect(host.querySelector('[aria-label="Properties"]')?.getAttribute("aria-selected")).toBe("true");
  });

  it("switches panels without dismissing the sheet", async () => {
    const onSelectPanel = vi.fn();
    const onDismiss = vi.fn();
    const host = await render(sheet({ onSelectPanel, onDismiss }));

    await act(async () => {
      host.querySelector<HTMLButtonElement>('[aria-label="Properties"]')?.click();
    });

    expect(onSelectPanel).toHaveBeenCalledWith("properties");
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @thinkbrain/desktop test -- InspectorSheet`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the sheet**

```tsx
import { BottomSheet } from "@thinkbrain/ui";

import { cn } from "../../lib/utils";
import { RightPopout } from "../../panels/RightPopout";
import { useRightPanelContributions } from "../../panels/panelRegistryModel";
import type { RightPanel } from "../shellTypes";

/**
 * Document inspectors, reached from the header's `⋯`.
 *
 * Driven by `useRightPanelContributions()` — the same source the desktop
 * title-bar buttons read — so an extension that registers a right panel appears
 * here with no mobile-specific work.
 */
export function InspectorSheet({
  open,
  panel,
  rootPath,
  documentContents,
  onDismiss,
  onSelectPanel
}: {
  readonly open: boolean;
  readonly panel: RightPanel;
  readonly rootPath: string | null;
  readonly documentContents: string | null;
  readonly onDismiss: () => void;
  readonly onSelectPanel: (panel: RightPanel) => void;
}) {
  const panels = useRightPanelContributions();

  return (
    <BottomSheet open={open} onDismiss={onDismiss} label="Document tools">
      <div
        role="tablist"
        aria-label="Inspectors"
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-border p-2"
      >
        {panels.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-label={entry.label}
            aria-selected={entry.id === panel}
            className={cn(
              "min-h-11 shrink-0 cursor-pointer rounded-small border border-border bg-surface px-3 text-xs text-muted-foreground focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:min-h-11",
              entry.id === panel && "bg-primary text-primary-foreground"
            )}
            onClick={() => onSelectPanel(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <RightPopout panel={panel} rootPath={rootPath} documentContents={documentContents} />
      </div>
    </BottomSheet>
  );
}
```

- [ ] **Step 4: Wire it into `PhoneShell`**

```tsx
  const [inspectorOpen, setInspectorOpen] = useState(false);
```

```tsx
        onOpenInspector={() => setInspectorOpen(true)}
```

```tsx
      <InspectorSheet
        open={inspectorOpen}
        panel={shell.rightPanel ?? "outline"}
        rootPath={shell.restoredWorkspacePath}
        documentContents={
          shell.activeDocument?.phase === "ready" ? shell.activeDocument.contents : null
        }
        onDismiss={() => setInspectorOpen(false)}
        onSelectPanel={(panel) => shell.setRightPanel(panel)}
      />
```

In `PhoneShell`'s `revealPanel`, a right-side target must open the sheet rather than take over the screen — an assistant shortcut should leave the note visible:

```tsx
      if (isBuiltInLeftPanel(panelId)) {
        setRevealed((current) => (current === panelId ? null : panelId));
        shell.selectLeftPanel(panelId);
      } else if (isSelectableRightPanel(panelId)) {
        shell.setRightPanel(panelId);
        setInspectorOpen(true);
      }
```

- [ ] **Step 5: Add a `PhoneShell` test for the assistant shortcut**

```tsx
  it("opens the inspector sheet from the assistant hub shortcut", async () => {
    const host = await render();

    await click(host, "Assistant");

    expect(host.querySelector('[aria-label="Document tools"]')).not.toBeNull();
  });
```

- [ ] **Step 6: Run tests and QA**

Run: `pnpm --filter @thinkbrain/desktop test && pnpm qa`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/shell/phone
git commit -m "feat(shell): make right panels reachable through a phone inspector sheet"
```

---

### Task 13: Surface fixes

Four corrections the phone chrome exposes. Grouped because each is a few lines and none is independently reviewable.

**Files:**
- Modify: `apps/desktop/src/panels/Popout.tsx:16-21`
- Modify: `apps/desktop/src/shell/phone/PhoneHeader.tsx` — sync status
- Modify: `apps/desktop/src/shell/phone/PhoneShell.tsx` — bottom panel as a sheet
- Create: `apps/desktop/src/shell/phone/useKeyboardInset.ts`
- Create: `apps/desktop/src/shell/phone/useKeyboardInset.test.tsx`
- Modify: `apps/desktop/src/shell/phone/PhoneHub.tsx`

- [ ] **Step 1: Remove the activity-bar inset from the phone popout**

`SIDE_CLASS.left` insets the full-screen popout by the rail's width. With no rail, that is a 3rem strip of nothing, and it contradicts the "content takes over" rule.

```ts
const SIDE_CLASS: Record<Side, string> = {
  // The phone offset that used to reserve the activity rail is gone: the rail
  // does not render in phone chrome, so a revealed panel takes the full width.
  left: "border-r border-border flex-[0_0_var(--tn-shell-left-width)] max-[760px]:left-0",
  right: "border-l border-border flex-[0_0_var(--tn-shell-right-width)] max-[760px]:right-0"
};
```

- [ ] **Step 2: Verify no desktop regression**

Run: `pnpm --filter @thinkbrain/desktop test -- Popout panelRegistry DesktopShell`
Expected: PASS. The changed class is inside a `max-[760px]:` variant, so wide layouts are untouched.

- [ ] **Step 3: Write the failing test for the keyboard inset**

The hub is bottom-anchored, so it is the one element whose position depends on the soft keyboard. `MetadataBottomSheet.tsx` already tracks `window.visualViewport` for the same reason — follow it rather than inventing a second approach.

```tsx
// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useKeyboardInset } from "./useKeyboardInset";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
  root = null;
  container = null;
});

const renderInset = async (): Promise<() => number> => {
  let latest = 0;
  const Probe = (): null => {
    latest = useKeyboardInset();
    return null;
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<Probe />));
  return () => latest;
};

describe("useKeyboardInset", () => {
  it("is zero when the platform has no visualViewport", async () => {
    vi.stubGlobal("visualViewport", undefined);

    const inset = await renderInset();

    expect(inset()).toBe(0);
  });

  it("reports the space the keyboard takes below the visual viewport", async () => {
    const listeners: Array<() => void> = [];
    vi.stubGlobal("innerHeight", 800);
    vi.stubGlobal("visualViewport", {
      height: 500,
      offsetTop: 0,
      addEventListener: (_: string, listener: () => void) => listeners.push(listener),
      removeEventListener: () => undefined
    });

    const inset = await renderInset();
    await act(async () => listeners.forEach((listener) => listener()));

    expect(inset()).toBe(300);
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `pnpm --filter @thinkbrain/desktop test -- useKeyboardInset`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement the hook**

```ts
import { useEffect, useState } from "react";

/**
 * Pixels the soft keyboard covers at the bottom of the layout viewport.
 *
 * `windowSoftInputMode="adjustResize"` shipped with the CodeMirror mobile work,
 * so the webview does resize — but a bottom-anchored hub still needs the number
 * to stay above the keyboard rather than float over it. Same `visualViewport`
 * approach `MetadataBottomSheet` already uses.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = typeof window === "undefined" ? undefined : window.visualViewport;
    if (!viewport) return;
    const update = (): void => {
      const covered = window.innerHeight - viewport.height - viewport.offsetTop;
      setInset(covered > 0 ? Math.round(covered) : 0);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  return inset;
}
```

- [ ] **Step 6: Apply the inset to the hub**

In `PhoneHub.tsx`, hide the hub entirely while the keyboard is open — a five-slot bar between the keyboard and the text being typed is worse than no bar:

```tsx
  const keyboardInset = useKeyboardInset();
  if (keyboardInset > 0) return null;
```

- [ ] **Step 7: Fold the status bar into the header**

`StatusBar` does not render in phone chrome. Its conflict counts are already
visible as drawer and hub badges, and its sync summary is a component in its own
right — reuse it rather than deriving a second label. `SyncStatus` has no `label`
field; `StatusBar.tsx:181` renders `<SyncPill status={…} onOpen={…} />`, so the
phone header renders exactly the same component.

Add to `PhoneHeader`'s props:

```tsx
  readonly syncStatus: SyncStatus;
  readonly onOpenSyncPanel: (panel: "conflicts" | "history") => void;
```

Render it left of the tab count, importing `SyncPill` from `../../sync/SyncPill`
and `SyncStatus` from `../../sync/historyTypes`:

```tsx
        <SyncPill status={syncStatus} onOpen={onOpenSyncPanel} />
```

In `PhoneShell`, pass `syncStatus={shell.syncStatus}` and an `onOpenSyncPanel`
that reveals the panel rather than opening a desktop dock:

```tsx
        onOpenSyncPanel={(panel) => revealPanel(panel)}
```

- [ ] **Step 8: Render the bottom panel as a sheet**

Three bottom chromes do not fit. The hub owns the bottom edge, so the bottom panel becomes a sheet:

```tsx
      <BottomSheet
        open={shell.bottomPanel !== null}
        onDismiss={() => shell.updateBottomPanel(null)}
        label="Bottom panel"
      >
        {shell.bottomPanel && (
          <BottomPanel
            active={shell.bottomPanel}
            onChange={shell.updateBottomPanel}
            onClose={() => shell.updateBottomPanel(null)}
          />
        )}
      </BottomSheet>
```

- [ ] **Step 9: Run tests and QA**

Run: `pnpm --filter @thinkbrain/desktop test && pnpm qa`
Expected: PASS.

- [ ] **Step 10: Verify on a device**

Run: `pnpm android:dev`
Expected: a revealed panel touches both edges; the hub disappears when the keyboard opens and returns when it closes; sync state is legible in the header.

- [ ] **Step 11: Commit**

```bash
git add apps/desktop/src/panels/Popout.tsx apps/desktop/src/shell/phone
git commit -m "fix(shell): correct phone popout width, keyboard inset and bottom surfaces"
```

---

### Task 14: Pin and remove hub shortcuts

The whole v1 customization affordance. A drag-reorder screen is deliberately not built — the editor is the expensive half, and pin/remove covers the actual use case.

**Files:**
- Create: `apps/desktop/src/shell/phone/hubEditing.ts`
- Create: `apps/desktop/src/shell/phone/hubEditing.test.ts`
- Modify: `apps/desktop/src/shell/phone/PhoneShell.tsx`
- Modify: `apps/desktop/src/shell/phone/PhoneDrawer.tsx`

**Interfaces:**
- Consumes: `HubItem`, `useHubItems` (Tasks 8, 9).
- Produces: `pinPanel(items, panelId)`, `removeItem(items, target)`, `MAX_HUB_ITEMS`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { MAX_HUB_ITEMS, pinPanel, removeItem } from "./hubEditing";
import type { HubItem } from "./hubModel";

const base: readonly HubItem[] = [
  { kind: "panel", id: "explorer" },
  { kind: "command", id: "new-note" },
  { kind: "menu" }
];

describe("pinPanel", () => {
  it("inserts before the menu, which stays last", () => {
    const next = pinPanel(base, "search");

    expect(next).toEqual([
      { kind: "panel", id: "explorer" },
      { kind: "command", id: "new-note" },
      { kind: "panel", id: "search" },
      { kind: "menu" }
    ]);
  });

  it("is a no-op for a panel already pinned", () => {
    expect(pinPanel(base, "explorer")).toEqual(base);
  });

  it("refuses to exceed the slot limit", () => {
    const full: readonly HubItem[] = [
      { kind: "panel", id: "explorer" },
      { kind: "panel", id: "search" },
      { kind: "panel", id: "conflicts" },
      { kind: "panel", id: "history" },
      { kind: "menu" }
    ];

    expect(pinPanel(full, "tags")).toEqual(full);
    expect(full).toHaveLength(MAX_HUB_ITEMS);
  });
});

describe("removeItem", () => {
  it("removes a matching panel", () => {
    expect(removeItem(base, { kind: "panel", id: "explorer" })).toEqual([
      { kind: "command", id: "new-note" },
      { kind: "menu" }
    ]);
  });

  it("never removes the menu", () => {
    expect(removeItem(base, { kind: "menu" })).toEqual(base);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @thinkbrain/desktop test -- hubEditing`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the editing helpers**

```ts
import type { HubItem } from "./hubModel";

/**
 * Slots the hub can hold.
 *
 * Five is not arbitrary: below roughly 72px per slot a label stops fitting on a
 * narrow phone, and the hub's whole point is that its labels are visible.
 */
export const MAX_HUB_ITEMS = 5;

const isSameTarget = (a: HubItem, b: HubItem): boolean =>
  a.kind === b.kind && (a.kind === "menu" || b.kind === "menu" || a.id === b.id);

/** Adds a panel shortcut before the menu slot, which always stays last. */
export function pinPanel(items: readonly HubItem[], panelId: string): readonly HubItem[] {
  if (items.some((item) => item.kind === "panel" && item.id === panelId)) return items;
  if (items.length >= MAX_HUB_ITEMS) return items;
  const menuIndex = items.findIndex((item) => item.kind === "menu");
  const insertAt = menuIndex === -1 ? items.length : menuIndex;
  return [...items.slice(0, insertAt), { kind: "panel", id: panelId }, ...items.slice(insertAt)];
}

/** Removes a shortcut. The menu is not removable — it is the only way back. */
export function removeItem(items: readonly HubItem[], target: HubItem): readonly HubItem[] {
  if (target.kind === "menu") return items;
  return items.filter((item) => !isSameTarget(item, target));
}
```

- [ ] **Step 4: Wire long-press into `PhoneShell`**

```tsx
  const { items, setItems } = useHubItems();
```

Pass to the hub and the drawer:

```tsx
        onLongPress={(target) => void setItems(removeItem(items, target))}
```

```tsx
        onLongPressPanel={(panelId) => void setItems(pinPanel(items, panelId))}
```

`PhoneDrawer` already forwards `onLongPressPanel` through `onContextMenu` (Task 10, Step 4) — on touch, a press-and-hold fires `contextmenu`, so no extra timer is needed there.

- [ ] **Step 5: Add a `PhoneShell` test**

```tsx
  it("pins a panel to the hub from a drawer long press", async () => {
    const host = await render();
    await click(host, "Open navigation");

    await act(async () => {
      host
        .querySelector('[aria-label="Saved versions"]')
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    });

    expect(host.querySelector('[aria-label="Primary navigation"]')?.textContent)
      .toContain("Saved versions");
  });
```

- [ ] **Step 6: Run tests and QA**

Run: `pnpm --filter @thinkbrain/desktop test && pnpm qa`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/shell/phone
git commit -m "feat(shell): pin and remove bottom hub shortcuts by long press"
```

---

### Task 15: End-to-end coverage

The gate is form factor, not build target, so the phone shell is reachable in Playwright by viewport plus touch emulation. No Android-only path exists to test around.

**Files:**
- Create: `apps/desktop/e2e/phone-shell.spec.ts`
- Modify: `apps/desktop/playwright.config.ts` — add a phone project

- [ ] **Step 1: Read the existing config and one spec**

Run: `cat apps/desktop/playwright.config.ts && ls apps/desktop/e2e`

Match its `webServer`, `baseURL` and helper conventions. Do not introduce a second way to start the app.

- [ ] **Step 2: Add a phone project**

`usePhoneChrome` requires `pointer: coarse` **and** a narrow viewport, so `hasTouch: true` is not optional here — a viewport-only project would render desktop chrome and silently test nothing.

```ts
    {
      name: "phone",
      use: {
        ...devices["Pixel 7"],
        // Both halves of the gate: viewport alone leaves desktop chrome mounted.
        viewport: { width: 412, height: 915 },
        hasTouch: true,
        isMobile: true
      }
    }
```

- [ ] **Step 3: Write the spec**

```ts
import { expect, test } from "@playwright/test";

test.describe("phone shell", () => {
  test("shows phone chrome and no activity rail", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByLabel("ThinkBrain mobile workspace")).toBeVisible();
    await expect(page.getByLabel("Workspace sections")).toHaveCount(0);
  });

  test("opens the same drawer from the header and the hub", async ({ page }) => {
    await page.goto("/");

    await page.getByLabel("Open navigation").tap();
    await expect(page.getByLabel("Navigation")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByLabel("Navigation")).toHaveCount(0);

    await page.getByLabel("Menu").tap();
    await expect(page.getByLabel("Navigation")).toBeVisible();
  });

  test("reaches the inspectors that the desktop hides on narrow screens", async ({ page }) => {
    await page.goto("/");

    await page.getByLabel("Document tools").tap();

    await expect(page.getByRole("tab", { name: "Outline" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Properties" })).toBeVisible();
  });

  test("keeps desktop chrome at a wide viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    await expect(page.getByLabel("ThinkBrain desktop workspace")).toBeVisible();
  });
});
```

- [ ] **Step 4: Run the suite**

Run: `pnpm test:e2e`
Expected: PASS. If the phone project cannot reach a workspace, follow whatever fixture the existing specs use to open one — do not add a new bootstrap path.

- [ ] **Step 5: Run full QA**

Run: `pnpm qa`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/e2e/phone-shell.spec.ts apps/desktop/playwright.config.ts
git commit -m "test(e2e): cover the phone shell by form factor"
```

---

## Done criteria

- `pnpm qa` and `pnpm test:e2e` pass.
- Desktop chrome is visually and behaviourally unchanged; no desktop test assertion was edited to accommodate the phone shell.
- On a device: no icon rail, labelled drawer, hub with visible labels and working badges, right panels reachable, revealed panels full width, hub out of the keyboard's way.
- `plans/mobile/pending-mobile_navigation_menu-med-med.md` and `plans/mobile/pending-responsive_layout-med-med.md` are renamed to `done-` in the same commit as the work that finishes them, per `AGENTS.md`.
