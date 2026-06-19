# Deferred: Mobile

Mobile is Phase 2 or later. Do not scaffold or implement `apps/mobile/` during MVP.

## Architectural Intent

The project is designed for desktop **and** mobile from day one, even though only desktop ships in MVP. The key architectural decisions that support this:

1. **Hub and Spoke**: `packages/core` contains all platform-agnostic business logic. Platform-specific apps (`apps/desktop`, `apps/mobile`) implement adapters.
2. **Platform Adapter Contract**: `packages/core` defines TypeScript interfaces (FileSystemAdapter, SearchAdapter, AppPathsAdapter, GitAdapter, SettingsAdapter) that abstract native capabilities. Each platform provides its own implementation.
3. **Separate UI layers**: `packages/ui` is React DOM and is consumed only by `apps/desktop`. The mobile app will have its own React Native UI in `apps/mobile/src/`. Shared design tokens (colors, spacing, typography) should live in `packages/core` so both platforms can reference them.

## Future Direction

Potential mobile app:

- React Native / Expo
- Shared domain logic from `packages/core`
- Mobile-specific filesystem and storage adapters (Expo FileSystem, expo-sqlite, AsyncStorage)
- Mobile-native navigation (stack/tab) — do not force desktop panels onto phone layouts
- Git integration likely via isomorphic-git or deferred further

## MVP Constraint

During MVP work, agents must:

- Keep `packages/core` free of Tauri, DOM, and Node-only imports
- Define adapter interfaces in `packages/core` rather than calling Tauri APIs directly from shared logic
- Not create `apps/mobile/` or any React Native dependencies

This ensures mobile can be added in Phase 2 without refactoring the shared core.
