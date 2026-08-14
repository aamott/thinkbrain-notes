- name: Disposal-promise self-reset pattern duplicated across two lifecycle factories
- file: /media/adam/extex/projects/thinkbrain-notes/packages/core/src/lifecycle.ts
- lines: 92-100 (createDisposableStore), 451-459 (createExtensionHost)
- description: Both `createDisposableStore` and `createExtensionHost` end their `dispose` with the same self-reset boilerplate:

  ```ts
  void completedDisposal.then(
    () => { if (disposalPromise === completedDisposal) disposalPromise = undefined; },
    () => { if (disposalPromise === completedDisposal) disposalPromise = undefined; }
  );
  ```

  and

  ```ts
  void completedDisposal.then(
    () => { if (hostDisposalPromise === completedDisposal) hostDisposalPromise = undefined; },
    () => { if (hostDisposalPromise === completedDisposal) hostDisposalPromise = undefined; }
  );
  ```

  The two `then` callbacks are identical (both branches do the same reset). A single helper removes the duplication and the repeated branch:

  ```ts
  const resetOnSettle = (p: Promise<void>, reset: () => void): void => {
    void p.then(reset, reset);
  };
  ```

  Used twice. Saves ~6 lines and makes the "clear the cached promise once it settles" intent explicit. The identical fulfill/reject branch is also a minor smell — collapsing to one callback is clearer.

- verification: Read `lifecycle.ts` lines 87-102 and 449-461. Both blocks are structurally identical except for the captured variable name.
- savings: ~6 lines.
