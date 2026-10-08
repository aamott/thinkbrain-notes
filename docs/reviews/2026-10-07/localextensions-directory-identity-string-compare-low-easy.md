# Directory identity is raw string equality, so aliases double-load or double-persist

- **Urgency:** low
- **Difficulty:** easy
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/extensions/localExtensions.ts`
- **Lines:** 79–82, 84–85, 106–113

## Description

Extension directories are compared and deduplicated by exact string match in
three places: `add`'s `entry.directory === directory` pre-check, `persist`'s
`Set` dedup, and `remove`'s `stored.includes(directory)`. None normalize:

- a trailing slash (`/ext/a` vs `/ext/a/`);
- separator style (`C:\ext` vs `C:/ext` on Windows);
- case (`/Ext/A` vs `/ext/a` on case-insensitive filesystems);
- symlinked paths.

An alias that slips past the `add` pre-check loads the same extension twice —
the second `addLocalExtension` throws a duplicate-id error that is converted
to `extension_already_registered`, which is a *confusingly worded* diagnostic
for "same directory, different spelling". And `restore` will attempt every
stored alias each launch.

Not a security hole (the native side canonicalizes for containment), but a
normalization step would make the UX match the filesystem.

## Recommendation

Normalize the directory once on entry to `add`/`load` — at minimum strip
trailing slashes and unify separators; ideally canonicalize (the native side
already canonicalizes, so a `canonicalize` IPC or a resolve via
`read_extension_file` of the manifest could double as the normalization
probe). Dedup and compare on the normalized form.

## Verification

`localExtensions.ts:107` (`entry.directory === directory`), `:80`
(`new Set(next)`), `:142` (`stored.includes(directory)`). No normalization
exists anywhere on the path between the directory picker
(`ExtensionsPanel.tsx:112`, `pickDirectoryPath`) and persistence.
