- name: markdown.ts compaction — extractWikiLinks ternary + maskMarkdown blank helper
- file: /media/adam/extex/projects/thinkbrain-notes/packages/core/src/markdown.ts
- lines: 151-166 (extractWikiLinks ternary), 237-244 (maskMarkdown blank helper)
- description: Two small compaction wins in `markdown.ts`.

  **1. extractWikiLinks ternary builds two near-identical object literals (lines 151-166):**

  `extractWikiLinks` pushes one of two objects depending on whether `displayText` exists:

  ```ts
  links.push(
    displayText
      ? { target, displayText, position, startOffset, endOffset }
      : { target, position, startOffset, endOffset }
  );
  ```

  The only difference is the presence of the `displayText` key. The `WikiLink` interface declares `displayText?: string`, so a single push with `displayText: displayText` (which may be `undefined`) is structurally equivalent for every consumer that reads `link.displayText`. Collapsing to one literal:

  ```ts
  links.push({ target, displayText, position, startOffset, endOffset });
  ```

  Saves ~10 lines. Note: `Object.keys(link)` would include `displayText` when the key is present-with-`undefined` vs absent, but no consumer in the repo iterates wiki-link keys (verified by grep — consumers read `.target`, `.displayText`, `.position`, `.startOffset`, `.endOffset` only). If key-absence matters for serialization, keep the ternary; otherwise inline.

  **2. maskMarkdown duplicates the blank-non-newlines replacement (lines 237-244):**

  `maskMarkdown` applies the same lambda twice — once for fenced code blocks, once for inline code:

  ```ts
  masked = masked.replace(/.../gm, (match) => match.replace(/[^\r\n]/g, " "));
  ...
  masked = masked.replace(/.../g, (match) => match.replace(/[^\r\n]/g, " "));
  ```

  The inner `(match) => match.replace(/[^\r\n]/g, " ")` is identical. Extracting a named `blankNonNewlines` helper clarifies intent and removes the duplicated lambda:

  ```ts
  const blankNonNewlines = (text: string): string => text.replace(/[^\r\n]/g, " ");
  ```

  Used twice, call sites stay readable. Saves ~2 lines and makes the masking primitive discoverable.

- verification: Read `markdown.ts` lines 136-170 (extractWikiLinks ternary confirmed) and 223-247 (maskMarkdown both replacements use the same inner function). Grepped `wikiLinks` consumers in `apps/desktop/src` and `packages/core/src` — all read named properties, none iterate keys.
- savings: ~12 lines.
