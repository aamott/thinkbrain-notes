- name: desktopState fallback save path has a TOCTOU read-modify-write race (warned but present)
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/desktopState.ts
- lines: 66-101
- description: |
    `saveDesktopState` (lines 72-101) has two paths:
      - If `gateway.updateDesktopState` exists (line 76), it delegates to the native `update_desktop_state` command — an atomic host-side update. Good.
      - Otherwise (fallback, lines 80-100) it does a read-modify-write: `readAppSettings` → parse → merge → `writeAppSettings`. The code itself warns (lines 80-83): "This may cause race conditions if multiple windows modify settings concurrently."

    The fallback serializes updates via a module-level `fallbackUpdateQueue` promise chain (line 66, 98-100), which prevents concurrent fallback calls from interleaving with EACH OTHER. But it does NOT prevent interleaving with:
      - `settingsStore.saveSettings()` writing app settings concurrently (different code path, different queue). The store's `saveSettings` (settingsStore.ts:374-383) reads `rawAppSettingsJson` (captured at load time) and writes via `serializeDynamicAppSettings` — if a fallback `saveDesktopState` read-modify-write fires between the store's load and save, the store could clobber the desktopState update (or vice versa). The store's `serializeDynamicAppSettings` DOES preserve desktopState from its `rawAppSettingsJson` snapshot, but that snapshot is now stale relative to the fallback's write — last writer wins, and one update is lost.
      - Any other writer to `read_app_settings`/`write_app_settings`.

    In production the native gateway always provides `updateDesktopState` (nativeDesktopStateGateway:51-53), so the fallback only runs in tests or if a custom gateway omits it. The warning is honest. Action item: ensure no production gateway omits `updateDesktopState`, and consider making it required (non-optional) on the `DesktopStateGateway` interface (line 33) so the fallback cannot accidentally be used in production. At minimum, add a test asserting the production gateway has it.

    Also: `fallbackUpdateQueue` is module-global mutable state (line 66) — fine for a single-window app, but if the desktop ever runs multiple renderer windows sharing this module, each window has its own queue and the serialization is per-window only.

- verification: |
    Read desktopState.ts:66-101 — fallback read-modify-write with module-level promise queue; warning at 80-83.
    Read desktopState.ts:30-34 — updateDesktopState is optional (?) on the interface.
    Read desktopState.ts:46-54 — native gateway provides it, so production is safe today.
    Read settingsStore.ts:374-383 — store saveSettings writes app settings via a separate path with its own rawAppSettingsJson snapshot; no coordination with fallbackUpdateQueue.
