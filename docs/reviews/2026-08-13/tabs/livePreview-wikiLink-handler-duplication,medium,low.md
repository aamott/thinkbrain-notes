- name: Duplicated WikiLink resolution logic in click and key handlers
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/tabs/livePreview/index.ts
- lines: 76-104 (click handler), 113-139 (key handler)
- description: The click handler and `Mod-Enter` key handler share ~10 lines of identical logic for resolving a wiki link at a position and calling `onOpenNote`. Both perform the same sequence:

  1. Walk up the syntax tree from a position to find a `WikiLink` node
  2. Extract the target text via `extractWikiLinkTarget`
  3. Resolve via `resolveWikiLinkTarget`
  4. Call `options.onOpenNote` with the resolved path

  Click handler (lines 88-101):
  ```ts
  let node: SyntaxNode | null = tree.resolve(pos, 1);
  while (node && node.name !== "WikiLink") {
    node = node.parent;
  }
  if (!node || node.name !== "WikiLink") return false;
  const targetText = extractWikiLinkTarget(node, view.state.doc);
  if (!targetText) return false;
  const resolvedPath = resolveWikiLinkTarget(targetText, options.noteIndex ?? []);
  if (!resolvedPath || !options.onOpenNote) return false;
  options.onOpenNote(resolvedPath);
  ```

  Key handler (lines 122-134) is identical except for the source of the position (`head` vs `pos`).

  Extract a helper, e.g.:
  ```ts
  function openWikiLinkAt(view: EditorView, pos: number, options: LivePreviewOptions): boolean {
    const tree = syntaxTree(view.state);
    let node: SyntaxNode | null = tree.resolve(pos, 1);
    while (node && node.name !== "WikiLink") node = node.parent;
    if (!node || node.name !== "WikiLink") return false;
    const targetText = extractWikiLinkTarget(node, view.state.doc);
    if (!targetText) return false;
    const resolvedPath = resolveWikiLinkTarget(targetText, options.noteIndex ?? []);
    if (!resolvedPath || !options.onOpenNote) return false;
    options.onOpenNote(resolvedPath);
    return true;
  }
  ```

  Then the click handler calls `openWikiLinkAt(view, view.posAtDOM(resolvedEl), options)` and the key handler calls `openWikiLinkAt(view, head, options)`.

- verification: Read `livePreview/index.ts` lines 76-139. Both blocks share the same tree-walk, extract, resolve, and callback sequence. The only difference is the source of the position (`view.posAtDOM(resolvedEl)` vs `view.state.selection.main.head`).
- savings: ~10 lines removed; net ~4 lines saved after adding the helper.
