- name: valueRef never updated after initialization — stale document on stateKey remount
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/tabs/MarkdownEditor.tsx
- lines: 98, 144, 149
- description: `valueRef` is initialized once at line 98 (`const valueRef = useRef(value)`) and never updated thereafter. It is used in the mount effect (lines 144 and 149) to set the initial document text and cursor position:

  ```ts
  doc: valueRef.current,
  selection: { anchor: bodyStart(valueRef.current) },
  ```

  The mount effect's dependency array is `[livePreviewCompartment, wikiLinkAutocompleteCompartment, stateKey]`. If `stateKey` changes without React remounting the component (i.e., without a `key` change), the mount effect re-runs and creates a new `EditorView` with `valueRef.current` — which still holds the **initial** `value` from the first render, not the current `value` prop. The cursor position (`bodyStart(valueRef.current)`) would also be computed against the stale text.

  In the current codebase this is latent: `TabContent.tsx` sets both `key={tab.id}` and `stateKey={tab.id}`, so a `stateKey` change always triggers a full remount (re-initializing `valueRef`). But any future caller that changes `stateKey` without changing `key` would hit the bug.

  Fix: add `valueRef.current = value;` in the render body (before effects), or at minimum in the value-sync effect (lines 180-185):
  ```ts
  useEffect(() => {
    valueRef.current = value;
    const view = viewRef.current;
    if (!view) return;
    const change = minimalChange(view.state.doc.toString(), value);
    if (change) view.dispatch({ changes: change });
  }, [value]);
  ```

- verification: Read `MarkdownEditor.tsx` lines 96-178. Grepped `valueRef` — only 3 matches (declaration + 2 usages in mount effect), no update assignment. Read `TabContent.tsx` line 135 confirming `key={tab.id}` matches `stateKey={tab.id}`.
