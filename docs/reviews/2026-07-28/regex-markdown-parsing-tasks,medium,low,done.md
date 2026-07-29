# Regex Parsing Matches Inside Code Blocks

**Urgency:** Low
**Difficulty:** Medium

In `packages/core/src/markdown.ts`, the `extractMarkdownTasks` function parses tasks by running a regular expression line-by-line. While `parseNote` passes a `maskedMarkdown` string (where code blocks have been replaced with spaces), we should verify that this completely prevents `extractMarkdownTasks` from matching false positive tasks inside code blocks.

## Action Item
- Verify if `maskMarkdown` correctly replaces all characters inside code blocks with spaces, preventing `TASK_PATTERN` from matching.
- If it does, no changes are needed, and you can report this as already resolved.
- If it doesn't, apply a robust fix so tasks within fenced code blocks and inline code are ignored.
