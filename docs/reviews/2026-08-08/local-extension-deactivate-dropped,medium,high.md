- name: Local extension `deactivate` export is silently dropped on registration
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/extensions/bootstrap.ts
- lines: 282-285 (also localDirectoryLoader.ts:44,150-163; desktopExtensionHost.ts:165-169)
- description: |
    The local-directory loader validates, imports, and returns an extension's
    `deactivate` export as part of `LoadedExtension` (localDirectoryLoader.ts
    lines 44, 150-163), and `validateExtensionModule` explicitly rejects a
    non-callable `deactivate` so an author's cleanup hook is never silently
    ignored (loader.ts lines 123-133).

    However, `bootstrap.addLocalExtension` only forwards `activate` to the
    host when registering a local extension:

    ```ts
    state.registration = host.register({
      id: state.manifest.id,
      activate: extension.activate
    });
    ```

    `extension.deactivate` is never passed. `DesktopExtensionDefinition.deactivate`
    is optional, so this type-checks, but the author's `deactivate` function —
    which the loader went to the trouble of validating — is dead code. On
    reload/remove, the host runs the default no-op deactivate, so any cleanup
    the extension expected (closing handles, removing listeners registered
    outside `subscriptions`, flushing state) never runs.

    This is a contract mismatch between the loader (which treats `deactivate`
    as a first-class export) and the bootstrap (which discards it), and it
    violates the "fail loudly" convention: the author writes a `deactivate`,
    it passes validation, and it is silently never called.

    Note also that `LoadedExtension.deactivate` is typed as
    `((context: never) => void | Promise<void>) | undefined` — the `never`
    context is a symptom of the same gap: the type system encodes that the
    function can never actually be invoked with a real `DesktopExtensionContext`.
- verification: |
    Read bootstrap.ts lines 282-285: `host.register` is called with only
    `id` and `activate`. Read localDirectoryLoader.ts lines 44 and 150-163:
    `LoadedExtension.deactivate` is populated from the validated module.
    Read desktopExtensionHost.ts lines 165-169: `DesktopExtensionDefinition`
    accepts an optional `deactivate`. Read loader.ts lines 123-133:
    `validateExtensionModule` rejects a non-callable `deactivate`, confirming
    the loader treats it as significant. The drop is therefore silent, not
    guarded.
