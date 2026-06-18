# Deferred: Mobile

Mobile is Phase 2 or later.

## Future Direction

Potential mobile app:

- React Native / Expo
- shared domain logic from `packages/core`
- mobile-specific filesystem and storage adapters
- mobile-native navigation instead of forcing desktop panels onto phone layouts

## MVP Constraint

Desktop architecture should avoid needless coupling to desktop-only concepts in shared domain types, but agents should not build the mobile app during MVP.
