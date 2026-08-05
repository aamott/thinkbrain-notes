# Workspace Explorer Refactor — Compaction Review

Scope: `WorkspaceExplorer.tsx` (~691 lines), `WorkspaceExplorer.module.css` (340 lines), `workspaceAdapter.ts` (58 lines).

Findings are ordered by impact. Each item lists the concrete duplication/verbosity, line references, and a suggested edit. No changes have been made.

---

## 1. `InlineEditRow` and `InlineCreateNode` are the same component with one parameter of difference

**Lines:** `WorkspaceExplorer.tsx:426–526`

The two functions are nearly line-for-line identical. Both:

- Hold `value` state + an `inputRef`.
- Run a `useEffect` on `focusRequest` to focus the input.
- Define the same `handleKeyDown` for Escape.
- Render the same `<form className={styles.treeRow} style={{ paddingLeft: ... }}>` with the same `<span className={styles.treeIcon}>` and `<input className={styles.renameInput}>`.
- Commit on submit; cancel on Escape.

The only real differences:

| Concern | `InlineEditRow` | `InlineCreateNode` |
|---|---|---|
| Wrapper element | none (rendered inside an existing `<li>`) | wraps in `<li className={styles.treeItem}>` |
| Initial value | `initialValue` (renames pre-fill) | `""` (creates start empty) |
| Focus effect | `focus()` + `select()` | `focus()` only |
| Placeholder/aria-label | none | "New folder/file name…" |
| `onBlur` | commit only if changed & non-empty | commit if non-empty |
| Icon | passed in | derived from `kind` |

**Suggested edit:** collapse into one `InlineNameInput` component. The wrapper-`<li>` decision can be a prop (`wrapInListItem`); the icon can stay a prop; the blur-commit policy can be a small callback prop. This removes ~50 lines and one whole component definition without obscuring anything — the unified component reads as "an inline text input in a tree row."

```tsx
// before: two components, ~100 lines combined (426–526)

// after: one component
function InlineNameInput({
  depth,
  icon,
  initialValue = "",
  placeholder,
  ariaLabel,
  focusRequest,
  selectOnFocus = false,
  wrapInListItem = false,
  onSubmit,
  onCancel
}: {
  readonly depth: number;
  readonly icon: string;
  readonly initialValue?: string;
  readonly placeholder?: string;
  readonly ariaLabel?: string;
  readonly focusRequest: number;
  readonly selectOnFocus?: boolean;
  readonly wrapInListItem?: boolean;
  readonly onSubmit: (value: string) => void;
  readonly onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    el?.focus();
    if (selectOnFocus) el?.select();
  }, [focusRequest]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  };

  const form = (
    <form
      className={styles.treeRow}
      style={{ paddingLeft: `${0.75 + depth * 0.875}rem` }}
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        onSubmit(value);
      }}
    >
      <span className={styles.treeIcon} aria-hidden="true">{icon}</span>
      <input
        ref={inputRef}
        className={styles.renameInput}
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={(event) => {
          const trimmed = event.target.value.trim();
          if (trimmed && (!initialValue || trimmed !== initialValue)) onSubmit(event.target.value);
          else onCancel();
        }}
      />
    </form>
  );

  return wrapInListItem ? <li className={styles.treeItem}>{form}</li> : form;
}
```

Call sites become:

```tsx
// rename (line 357–364)
<InlineNameInput
  depth={depth}
  icon={isDirectory ? (isExpanded ? "⌄" : "›") : "·"}
  initialValue={node.entry.name}
  focusRequest={renaming!.focusRequest}
  selectOnFocus
  onSubmit={(name) => onSubmitRename(renaming!, name)}
  onCancel={onCancelRename}
/>

// create (lines 263–268 and 387–393)
<InlineNameInput
  depth={depth + 1}
  icon={creating!.kind === "folder" ? "›" : "·"}
  placeholder={creating!.kind === "folder" ? "New folder name…" : "New file name…"}
  ariaLabel={creating!.kind === "folder" ? "New folder name" : "New file name"}
  focusRequest={creating!.focusRequest}
  wrapInListItem
  onSubmit={(name) => onSubmitCreate(creating!, name)}
  onCancel={onCancelCreate}
/>
```

**Caveat:** the original `InlineEditRow`'s `onBlur` checks `value.trim() !== initialValue`; the unified version preserves that. The create path's `onBlur` only checks non-empty — equivalent under `initialValue = ""` because `trimmed !== ""` is the same as `trimmed` truthy. Behavior preserved.

**Net:** ~50 lines removed, one fewer component to reason about, no comment loss.

---

## 2. `WorkspaceTreeItem` prop drilling — 11 callbacks/state pieces forwarded unchanged to every child

**Lines:** `WorkspaceExplorer.tsx:318–422` (especially the recursive call at `398–414`)

Every recursive `WorkspaceTreeItem` re-passes 11 props verbatim:

```tsx
onMarkdownFileSelected={onMarkdownFileSelected}
onContextMenu={onContextMenu}
renaming={renaming}
creating={creating}
onSubmitRename={onSubmitRename}
onSubmitCreate={onSubmitCreate}
onCancelRename={onCancelRename}
onCancelCreate={onCancelCreate}
onStartRename={onStartRename}
onRequestDelete={onRequestDelete}
onStartCreate={onStartCreate}
```

This is real duplication: 11 lines repeated at every recursion level, plus the same 11 fields in the props type (lines 335–345). It also forces `memo` to do shallow compares on 11 stable-but-reallocated-per-render references unless every parent wraps each handler in `useCallback` (which it does — but the `renaming`/`creating` state objects change identity on every edit, defeating `memo` for the whole subtree anyway).

**Suggested edit:** group the cross-cutting handlers/state into one `TreeContext` value typed once, provided once at the top, and consumed via `useContext` in `WorkspaceTreeItem`. This collapses the props type from 14 fields to 3 (`node`, `depth`, optional override) and removes the 11-line forwarding block at every recursion.

```tsx
interface TreeContextValue {
  readonly onMarkdownFileSelected: (relativePath: string) => void;
  readonly onContextMenu: (event: ReactMouseEvent, target: ContextMenuTarget) => void;
  readonly renaming: RenameState | null;
  readonly creating: CreateState | null;
  readonly onSubmitRename: (target: RenameState, newName: string) => void;
  readonly onSubmitCreate: (target: CreateState, name: string) => void;
  readonly onCancelRename: () => void;
  readonly onCancelCreate: () => void;
  readonly onStartRename: (entry: NativeWorkspaceEntry) => void;
  readonly onRequestDelete: (entry: NativeWorkspaceEntry) => void;
  readonly onStartCreate: (parentPath: string, kind: "file" | "folder") => void;
}
const TreeContext = createContext<TreeContextValue | null>(null);

// in WorkspaceExplorer's ready branch:
<TreeContext.Provider value={{
  onMarkdownFileSelected: handleMarkdownFileSelected,
  onContextMenu: showContextMenu,
  renaming, creating,
  onSubmitRename: submitRename, onSubmitCreate: submitCreate,
  onCancelRename: () => setRenaming(null), onCancelCreate: () => setCreating(null),
  onStartRename: startRename, onRequestDelete: requestDelete, onStartCreate: startCreate
}}>
  <ul className={styles.tree}>…</ul>
</TreeContext.Provider>

const WorkspaceTreeItem = memo(function WorkspaceTreeItem({ node, depth = 0 }: {
  readonly node: WorkspaceTreeNode;
  readonly depth?: number;
}) {
  const ctx = useTreeContext();
  // …use ctx.onContextMenu etc.
  // recursive call collapses to:
  // <WorkspaceTreeItem key={child.entry.relative_path} node={child} depth={depth + 1} />
});
```

**Trade-off to flag, not hide:** context value identity changes whenever `renaming`/`creating` change, so all consumers re-render on every edit start — same as today (the prop-drilled `renaming`/`creating` already defeat `memo`). If you want to preserve the current "only the renamed subtree re-renders" property you'd need to split context into a stable-handlers context and a separate `renaming`/`creating` context, or keep `renaming`/`creating` as props. **Recommendation:** adopt context for the 9 stable handlers/state-setters only, and keep `renaming`/`creating` as props. That removes 9 of the 11 forwarded lines and keeps `memo` effective for the common case (browsing without editing).

```tsx
interface TreeHandlers { /* the 9 stable callbacks above */ }
const TreeHandlersContext = createContext<TreeHandlers | null>(null);

const WorkspaceTreeItem = memo(function WorkspaceTreeItem({
  node, depth = 0, renaming, creating
}: {
  readonly node: WorkspaceTreeNode;
  readonly depth?: number;
  readonly renaming: RenameState | null;
  readonly creating: CreateState | null;
}) {
  const { onContextMenu, onSubmitRename, /* …8 total */ } = useTreeHandlers();
  // recursive call:
  // <WorkspaceTreeItem node={child} depth={depth + 1} renaming={renaming} creating={creating} />
});
```

That cuts the forwarded block from 11 lines to 2 and the props type from 14 fields to 4, while keeping `memo` useful.

---

## 3. CSS: repeated declaration blocks that can share a selector list

**Lines:** `WorkspaceExplorer.module.css`

### 3a. `.emptyState` and `.status` are textually identical except `.emptyState` adds `text-align: center`

Lines `64–93`:

```css
.emptyState,
.status,
.error {
  margin: auto 0;
  padding: 1.25rem;
  color: var(--tn-color-muted-foreground);
  font-size: 0.75rem;
  line-height: 1.5;
}

.emptyState { text-align: center; }

.status { text-align: center; }
```

`.emptyState` and `.status` each add `text-align: center` in separate rules. Combine:

```css
.emptyState,
.status {
  text-align: center;
}
```

Saves 3 lines, no behavior change.

### 3b. `.emptyState strong` / `.error strong` and `.emptyState p` / `.error p` are already grouped — good

Lines `78–89` are correctly consolidated. No change.

### 3c. `.menuItem` / `.menuItemDanger` hover/focus selectors duplicate the pseudo-class chain

Lines `262–268`:

```css
.menuItem:hover,
.menuItem:focus-visible,
.menuItemDanger:hover,
.menuItemDanger:focus-visible {
  background: var(--tn-color-accent);
  outline: none;
}
```

This is already consolidated across the two classes — fine. But note `.menuItem, .menuItemDanger` (lines `246–260`) and the `:hover/:focus-visible` block (262–268) could be merged into one selector list if you prefer, since both target the same two classes. Not a win — keep as is (separating base from interaction is clearer).

### 3d. `.treeRow` and the inline-edit `<form>` reuse `styles.treeRow` — good, no duplication

The TSX correctly reuses `styles.treeRow` for both the button and the form (lines `367`, `451`, `502`). No CSS duplication here. Worth noting as already-good.

### 3e. `.deleteDialog button` repeats the "button reset" pattern shared with `.error button` and `.openButton`

Lines `103–113` (`.error button`), `326–335` (`.deleteDialog button`), and `42–53` (`.openButton`) all repeat:

```css
border: 1px solid …;
border-radius: var(--tn-radius-small);
padding: …;
color: …;
background: …;
cursor: pointer;
font: inherit;
font-size: …;
```

**Suggested edit:** extract a shared `.btn` base class (or a `:where(.openButton, .error button, .deleteDialog button)` reset) and let each variant override only color/background/padding. CSS Modules supports composing via `composes: btn` from a shared module, or a local `:where()` list.

```css
.btn {
  border-radius: var(--tn-radius-small);
  cursor: pointer;
  font: inherit;
}
```

Then `composes: btn` in `.openButton`, `.error button` (via a named class — currently `.error button` is an element selector; you'd need to add a class to the JSX), and `.deleteDialog button` (same caveat). **Trade-off:** the element-selector rules (`.error button`, `.deleteDialog button`) are convenient because the JSX doesn't tag each button with a class. Adopting `composes` requires adding `className={styles.errorButton}` etc. in `ErrorState` and `DeleteConfirmDialog`. Net is roughly neutral on lines but improves consistency. **Lower priority than 3a.**

### 3f. `.renameInput` `:focus-visible` outline is a one-off

Lines `228–231` — fine, no duplication.

---

## 4. Verbose React patterns with idiomatic equivalents

### 4a. `runWithRefresh` + `submitCreate`/`submitRename`/`confirmDelete` share a "guard rootPath, trim, run, finally clear state" skeleton

**Lines:** `WorkspaceExplorer.tsx:135–179`

All three follow:

```tsx
const rootPath = state.snapshot?.workspace.root_path;
if (!rootPath) return;
const trimmed = …;
if (!trimmed || trimmed === …) { set<State>(null); return; }
void runWithRefresh(async () => { await api.<op>(rootPath, …); }).finally(() => set<State>(null));
```

This is mild duplication, not severe. **Suggested edit (optional, low priority):** a tiny helper `commitInline(setState, op)` that takes the state-clear and the operation. But the three call sites differ enough (rename has the "unchanged" short-circuit; create has the markdown-select option) that a helper risks being more opaque than the duplication. **Recommendation: leave as is.** Noting it for completeness.

### 4b. `prevNewNoteRequest` render-time state sync is correct but the comment block is large

**Lines:** `96–107`

The pattern is the React-recommended one and the comment is justified (it cites the docs). No change — calling out only because the review asked about verbose patterns. Keep.

### 4c. `WorkspaceContextMenu`'s `handle` wrapper + repeated `isFolder &&` / `isBackground &&` guards

**Lines:** `575–599`

Each menu item is guarded by a ternary on `target.kind`. Six items, six guards. This is readable but verbose. A small array-driven render would be more idiomatic:

```tsx
const items: Array<{ label: string; danger?: boolean; action: () => void } | "sep"> = [];
if (isFolder) {
  items.push(
    { label: "New file", action: () => onStartCreate(createParentPath, "file") },
    { label: "New folder", action: () => onStartCreate(createParentPath, "folder") },
    "sep",
    { label: "Rename", action: () => onStartRename(target.entry!) },
    { label: "Delete", danger: true, action: () => onRequestDelete(target.entry!) }
  );
} else if (isFile) {
  items.push("sep", { label: "Rename", action: () => onStartRename(target.entry!) }, { label: "Delete", danger: true, action: () => onRequestDelete(target.entry!) });
} else {
  items.push(
    { label: "New file", action: () => onStartCreate("", "file") },
    { label: "New folder", action: () => onStartCreate("", "folder") },
    "sep",
    { label: "Refresh", action: () => { onRefresh(); onClose(); } },
    { label: "Open workspace…", action: () => { onOpenWorkspace(); onClose(); } }
  );
}

return (
  <div ref={menuRef} className={styles.menu} role="menu" …>
    {items.map((item, i) =>
      item === "sep"
        ? <hr key={i} className={styles.menuSeparator} />
        : <MenuButton key={item.label} label={item.label} danger={item.danger} onClick={handle(item.action)} />
    )}
  </div>
);
```

**Trade-off:** removes the per-line `isFolder &&` noise and the `handle` wrapper's repetition, but introduces an array literal on every render. Acceptable for a 6-item menu. **Medium priority** — improves readability more than it cuts lines.

### 4d. `EntryKind` could be a lookup, but the if/return is clearer

**Lines:** `666–669` — fine as is. No change.

### 4e. `rootClassName` join

**Line:** `226` — `[styles.explorer, className].filter(Boolean).join(" ")` is fine and idiomatic. If `clsx`/`classnames` is already a dep elsewhere in the repo, prefer it for consistency; otherwise leave.

---

## 5. `workspaceAdapter.ts` — no compaction needed

**Lines:** `1–58`

Each method is a one-line `invokeNativeCommand` delegation with distinct command names and argument shapes. The repetition is structural (Tauri command boundary) and collapsing it (e.g. a generic `invoke(command, rootPath, payload)`) would erase the typed parameter signatures that are the file's main value. **No change.** The interface docstrings are useful and should stay.

---

## Priority summary

| # | Change | Lines saved (approx) | Readability | Risk |
|---|---|---|---|---|
| 1 | Merge `InlineEditRow` + `InlineCreateNode` → `InlineNameInput` | ~50 | neutral/positive | low |
| 2 | Context for the 9 stable tree handlers (keep `renaming`/`creating` as props) | ~20 + simpler props type | positive | low |
| 3a | Merge `.emptyState`/`.status` `text-align: center` rules | 3 | neutral | none |
| 4c | Array-driven context menu render | ~10 | positive | low |
| 3e | Shared `.btn` base via `composes` | ~5 | neutral | low (requires JSX class additions) |
| 4a | `commitInline` helper for create/rename/delete | ~8 | slightly negative | medium — risks opacity |

Recommended to do **1, 2, 3a, 4c**. Skip 4a and treat 3e as optional polish.

---

## Notes outside this review's scope (flagged, not actioned)

- `WorkspaceExplorer.tsx:254` inlines `style={{ color: "var(--tn-color-danger)" }}` on the action-error `<p>` instead of using a CSS class. Minor inconsistency with the rest of the file's class-based styling — worth a dedicated `.actionError` class if you touch this area.
- `WorkspaceExplorer.tsx:272` builds the React `key` from `${workspaceRootPath}/${node.entry.relative_path}`. `relative_path` is already unique within a workspace; the `workspaceRootPath` prefix is only useful if the same tree could be re-mounted across workspaces, which it isn't (the component re-mounts on workspace change). `key={node.entry.relative_path}` would suffice. Not a compaction issue, just a simplification.
