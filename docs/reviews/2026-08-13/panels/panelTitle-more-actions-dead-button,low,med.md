- name: PanelTitle "More actions" (•••) button has no onClick handler
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/panels/PanelTitle.tsx
- lines: 52-57
- description: |
    The trailing `•••` button in the panel header is rendered as a
    `<button type="button">` with an `aria-label` but no `onClick`:

    ```tsx
    <button
      className="..."
      aria-label={`More ${title} actions`}
    >
      •••
    </button>
    ```

    Clicking it does nothing. It is not disabled, so it presents as an active
    affordance that silently swallows clicks. Either wire it to an overflow menu
    or remove it until that menu exists.
- verification: |
    `grep -n "onClick\|•••" apps/desktop/src/panels/PanelTitle.tsx` shows the
    only `onClick` in the file is on the action buttons (line 47); the
    `•••` button (line 56) has none.
