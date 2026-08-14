- name: OutlinePanel onNavigate callback is never passed in production — heading clicks are no-ops
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/panels/OutlinePanel.tsx
- lines: 9, 25, 80
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/panels/panelRegistry.tsx
- lines: 259
- description: |
    `OutlinePanel` accepts an optional `onNavigate?: (line: number) => void`
    and renders a `<button onClick={() => onNavigate?.(node.heading.line)}>` for
    every heading. But the registry factory that mounts the panel passes only
    `contents`:

    ```tsx
    factory: ({ documentContents }) => <OutlinePanel contents={documentContents} />
    ```

    `onNavigate` is never supplied, so `onNavigate?.(...)` is always a no-op.
    The headings are styled as buttons and are keyboard-focusable, so users
    will click/Enter expecting the editor to jump to that heading and nothing
    will happen. The prop is only exercised in `OutlinePanel.test.tsx` (line 33).

    Either wire `onNavigate` to the active editor's line-reveal API from the
    shell, or render the headings as non-interactive text until navigation is
    connected (mirroring the `Unavailable` pattern used elsewhere).
- verification: |
    `grep -rn "onNavigate" apps/desktop/src` shows the prop declared and used
    inside OutlinePanel.tsx and passed only in OutlinePanel.test.tsx. The
    production factory in panelRegistry.tsx line 259 does not pass it.
