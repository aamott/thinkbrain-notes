import { parseFrontmatter } from "./frontmatter";
import type { MarkdownTask, ParsedNote, WikiLink } from "./note-model";

const INLINE_TAG_PATTERN = /(^|[^A-Za-z0-9_/-])#([A-Za-z0-9][A-Za-z0-9_/-]*)/g;
const WIKI_LINK_PATTERN = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;
const TASK_PATTERN = /^\s*-\s+\[([ xX])\](?:\s+(.*))?$/;

/**
 * Parses a Markdown note into frontmatter metadata and derived Markdown indexes.
 *
 * Args:
 *   markdown: Complete Markdown file contents.
 *
 * Returns:
 *   Parsed frontmatter, body, tags, aliases, wiki links, tasks, and diagnostics.
 */
export function parseNote(markdown: string): ParsedNote {
  const frontmatterResult = parseFrontmatter(markdown);
  const inlineTags = extractInlineTags(frontmatterResult.body);
  const tags = uniqueStrings([...frontmatterResult.metadata.tags, ...inlineTags]);

  return {
    ...frontmatterResult,
    inlineTags,
    tags,
    aliases: frontmatterResult.metadata.aliases,
    wikiLinks: extractWikiLinks(frontmatterResult.body),
    tasks: extractMarkdownTasks(frontmatterResult.body)
  };
}

export function extractInlineTags(markdownBody: string): string[] {
  return collectMatches(markdownBody, INLINE_TAG_PATTERN, (match) => match[2]);
}

export function extractWikiLinks(markdownBody: string): WikiLink[] {
  const links: WikiLink[] = [];

  for (const match of markdownBody.matchAll(WIKI_LINK_PATTERN)) {
    const target = match[1]?.trim();

    if (!target) {
      continue;
    }

    const displayText = match[2]?.trim();
    const position = match.index ?? 0;

    links.push(
      displayText
        ? {
            target,
            displayText,
            position
          }
        : {
            target,
            position
          }
    );
  }

  return links;
}

export function extractMarkdownTasks(markdownBody: string): MarkdownTask[] {
  const tasks: MarkdownTask[] = [];
  const lines = markdownBody.split(/\r?\n/);

  lines.forEach((line, index) => {
    const match = TASK_PATTERN.exec(line);

    if (!match) {
      return;
    }

    tasks.push({
      checked: match[1]?.toLowerCase() === "x",
      text: match[2]?.trim() ?? "",
      line: index + 1
    });
  });

  return tasks;
}

function collectMatches(
  markdownBody: string,
  pattern: RegExp,
  pickValue: (match: RegExpExecArray) => string | undefined
): string[] {
  const values: string[] = [];
  let match = pattern.exec(markdownBody);

  while (match) {
    const value = pickValue(match)?.trim();

    if (value) {
      values.push(value);
    }

    match = pattern.exec(markdownBody);
  }

  pattern.lastIndex = 0;
  return uniqueStrings(values);
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}
