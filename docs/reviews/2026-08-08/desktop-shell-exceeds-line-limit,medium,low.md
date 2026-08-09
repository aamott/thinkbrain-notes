- name: DesktopShell.tsx exceeds 500-line modularity limit
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/shell/DesktopShell.tsx
- lines: 1-747
- description: |
    `DesktopShell.tsx` is 747 lines, well above the project's <500-line
    preference (AGENTS.md: "Small, focused files (< 500 lines preferred)") and
    the `apps/desktop/src/AGENTS.md` guidance that `DesktopShell.tsx` should be
    "a slim composition orchestrator (state/effects/callbacks only)."

    The file currently mixes:
      - Workspace restoration and persistence (lines 116-178, 201-237)
      - Tab lifecycle and document loading (lines 335-475)
      - Panel resize logic (lines 229-277, 506-575)
      - Global keyboard shortcuts (lines 482-504)
      - Command palette wiring (lines 312-423)
      - Dirty-close dialog orchestration (lines 684-716)
      - Tab serialization helpers (lines 722-747)

    Candidates for extraction into focused modules:
      - `useWorkspaceRestore` hook (state restoration + recents refresh)
      - `usePanelResize` hook (resize logic + width persistence)
      - `useDesktopShortcuts` hook (global keydown handler)
      - `useDocumentPersistence` hook (open/load/save document logic)
      - `tabSerialization.ts` (tabToPersisted / restoreTab)

    The shell should retain only the composition of these hooks and the JSX
    layout, keeping it under the 500-line target.
- verification: |
    Read the full file (747 lines). Confirmed line count exceeds the 500-line
    preference stated in AGENTS.md. Identified six distinct responsibility
    clusters that could be extracted.
