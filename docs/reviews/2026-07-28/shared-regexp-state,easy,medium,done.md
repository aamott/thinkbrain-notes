# Shared RegExp State in Markdown Parsing

**Urgency:** Medium
**Difficulty:** Easy

The `INLINE_TAG_PATTERN` in `packages/core/src/markdown.ts` is defined with the global `/g` flag. The `collectMatches` function sets `pattern.lastIndex = 0` before and after execution to manage this state. While JavaScript in this environment is single-threaded, sharing mutable RegExp state across function invocations is a known code smell and can lead to subtle bugs if the function is ever made asynchronous or if a generator yields execution while iterating.

## Action Item
- Refactor `collectMatches` or `extractInlineTags` to either clone the RegExp on each invocation or use `String.prototype.matchAll` which handles state safely without mutating the global `lastIndex`.
- Avoid manually managing `pattern.lastIndex = 0` for shared global patterns.
