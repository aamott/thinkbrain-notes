- name: Duplicate prefixed-register blocks and identical regexes in desktopExtensionHost
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/extensions/desktopExtensionHost.ts
- lines: 176-231, 348-384
- description: |
    Two compaction opportunities in the desktop extension context factory:

    1. **Identical regexes** (lines 176 and 231): `LOCAL_KEY_PATTERN` and
       `SECTION_ID_PATTERN` are byte-for-byte identical
       (`/^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z][A-Za-z0-9_-]*)*$/`). They validate
       different things (extension-local setting keys vs. section ids) but enforce
       the same dotted-identifier rule. One named constant covers both.

    2. **Four near-identical `register` blocks** (lines 348-384): `commands`,
       `panels`, `editorHooks`, and `editorHeaders` each repeat the same shape:
       ```ts
       register: (item) => {
         assertActive();
         return own(context, registries.X.register({
           ...item,
           id: prefixId(context.extensionId, "Kind", item.id)
         }), assertActive);
       }
       ```
       Only the registry and the human-readable `kind` label differ. `tabs.register`
       is intentionally different (uses `kind` not `id`, tracks `ownKinds`), so it
       stays as-is. A small helper eliminates the duplication:
       ```ts
       const registerPrefixed = <T extends { readonly id: string }>(
         registry: { register(item: T): Disposable },
         kind: string
       ) => (item: T): Disposable => {
         assertActive();
         return own(context, registry.register({
           ...item,
           id: prefixId(context.extensionId, kind, item.id)
         }), assertActive);
       };
       ```
       Then each surface becomes one line, e.g.
       `commands: { register: registerPrefixed(registries.commands, "Command") }`.
- verification: |
    Confirmed by reading lines 176-231 (regexes) and 348-414 (context factory).
    `grep` for `LOCAL_KEY_PATTERN|SECTION_ID_PATTERN` shows both are used only in
    this file. The four register blocks were compared line-by-line; only `tabs`
    differs. Call sites stay readable with the helper.
- savings: ~16 lines for the register helper, ~2 lines for the regex merge.
