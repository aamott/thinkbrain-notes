- name: Duplicated register-and-stub logic between built-in loop and addLocalExtension
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/extensions/bootstrap.ts
- lines: 214-221, 284-294
- description: |
    The built-in bootstrap loop and `addLocalExtension` both perform the same
    "register with host, then either activate on startup or install stubs"
    sequence:

    Built-in (lines 214-221):
    ```ts
    state.registration = host.register({ id: manifest.id, activate: extension.activate });
    if (hasStartupActivation(manifest)) {
      void ensureActive(state).catch(() => undefined);
      continue;
    }
    registerStubs(state);
    ```

    addLocalExtension (lines 284-294):
    ```ts
    state.registration = host.register({
      id: state.manifest.id,
      activate: extension.activate,
      deactivate: extension.deactivate
    });
    if (hasStartupActivation(state.manifest)) {
      void ensureActive(state).catch(() => undefined);
    } else {
      registerStubs(state);
    }
    rebuildSnapshot();
    ```

    The differences are: (a) local extensions pass `deactivate`, (b) the built-in
    uses `continue` to skip to the next iteration, (c) `addLocalExtension` calls
    `rebuildSnapshot()` at the end. A helper that takes the `EntryState` plus the
    activate/deactivate pair and performs register + activate-or-stub removes the
    duplication; the built-in loop keeps its `continue` and `addLocalExtension`
    keeps its `rebuildSnapshot()`:
    ```ts
    const registerAndStub = (state: EntryState, activate: DesktopExtensionActivation, deactivate?: ...) => {
      state.registration = host.register({ id: state.manifest.id, activate, deactivate });
      if (hasStartupActivation(state.manifest)) {
        void ensureActive(state).catch(() => undefined);
      } else {
        registerStubs(state);
      }
    };
    ```
- verification: |
    Read lines 174-222 (built-in loop) and 261-297 (`addLocalExtension`).
    Confirmed both blocks share the register + `hasStartupActivation` branch +
    `registerStubs` shape. `deactivate` is `undefined` for built-ins
    (`BuiltInExtension` has no `deactivate` field), so passing `undefined` is
    equivalent.
- savings: ~6 lines.
