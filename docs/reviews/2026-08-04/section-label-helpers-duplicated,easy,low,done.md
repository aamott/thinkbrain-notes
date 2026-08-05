- name: findSectionLabel / searchSections helper duplicated between SettingsNav and SettingsContent
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/SettingsNav.tsx
- lines: 155-167 (SettingsNav.tsx) and 51-75 (SettingsContent.tsx)
- description: Two near-identical recursive section-label lookups exist:
  - `SettingsNav.findSectionLabel(sections, sectionId)` (lines 155-167) takes a `readonly SettingSection[]` and a `sectionId`, recurses through `section.subsections`, returns `section.label`.
  - `SettingsContent.findSectionLabel(sectionId)` (lines 51-57) wraps a `searchSections` helper (lines 60-75) that does the same recursion but with a weaker, hand-rolled section type (`{ id; label; subsections?: readonly unknown[] }`) and an unsafe cast (`subsections as readonly { id; label; subsections?: readonly unknown[] }[]` at line 68).
  Both implement the same "scan module sections recursively for a matching section id and return its label" operation. The SettingsContent version additionally iterates all modules (line 52) because it only has a section id, while SettingsNav already has the module in scope. The duplication means a future change to section shape (e.g. adding aliases) must be made in two places, and the SettingsContent copy uses `unknown[]` casts that defeat type safety.
- verification: Read both files in full. Confirmed the two functions perform identical recursion with different signatures and that SettingsContent's `searchSections` casts `subsections` through `unknown[]`.
