# Unbounded Cache Growth in GitService

**Urgency:** Low
**Difficulty:** Easy

In `apps/desktop/src/git/gitService.ts`, the `repositories` and `statuses` caches use an `LruCache` with a size of 10. While the LRU eviction policy prevents true unbounded growth, verify if there are any edge cases (like unhandled Promise rejections lingering, or missing cache invalidation events) that could lead to stale data or effectively leaked memory over long sessions. 

## Action Item
- Review the `GitService` implementation for potential memory leaks or unbound data structures.
- If the `LruCache` implementation already fully mitigates the issue described in the review finding, report that no changes are necessary. Otherwise, fix any identified leaks.
