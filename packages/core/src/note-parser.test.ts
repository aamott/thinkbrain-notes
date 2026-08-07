import { describe, expect, it } from "vitest";

import {
  parseFrontmatter,
  parseNote,
  serializeNote,
  type NoteMetadata
} from "./index";

describe("note parser", () => {
  it("extracts frontmatter metadata, inline tags, wiki links, and tasks", () => {
    const parsed = parseNote(`---
title: Example Note
tags:
  - project
  - "#daily"
aliases:
  - Scratchpad
status: draft
created_at: 2026-06-17T12:00:00Z
updated_at: 2026-06-17T12:30:00Z
review:
  owner: user
---
# Heading

Body with #inline-tag and [[Some Note]] plus [[Other Note|Display Text]].

- [ ] Write parser
- [x] Add tests
`);

    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.body).toContain("Body with #inline-tag");
    expect(parsed.metadata).toMatchObject({
      title: "Example Note",
      tags: ["project", "daily"],
      aliases: ["Scratchpad"],
      status: "draft",
      created_at: "2026-06-17T12:00:00Z",
      updated_at: "2026-06-17T12:30:00Z",
      review: {
        owner: "user"
      }
    });
    expect(parsed.inlineTags).toEqual(["inline-tag"]);
    expect(parsed.tags).toEqual(["project", "daily", "inline-tag"]);
    expect(parsed.aliases).toEqual(["Scratchpad"]);
    expect(parsed.wikiLinks).toEqual([
      {
        target: "Some Note",
        position: expect.any(Number),
        startOffset: expect.any(Number),
        endOffset: expect.any(Number)
      },
      {
        target: "Other Note",
        displayText: "Display Text",
        position: expect.any(Number),
        startOffset: expect.any(Number),
        endOffset: expect.any(Number)
      }
    ]);
    // Lines 18 and 19 of the source above, counting the 14-line frontmatter
    // block. These previously read 16 and 17, which silently encoded a masking
    // bug that dropped the two `---` fence lines.
    expect(parsed.tasks).toEqual([
      {
        checked: false,
        text: "Write parser",
        line: 18,
        startOffset: expect.any(Number),
        endOffset: expect.any(Number)
      },
      {
        checked: true,
        text: "Add tests",
        line: 19,
        startOffset: expect.any(Number),
        endOffset: expect.any(Number)
      }
    ]);
  });

  it("treats notes without frontmatter as body-only notes", () => {
    const markdown = "# Plain note\n\nBody with #tag";
    const parsed = parseNote(markdown);

    expect(parsed.body).toBe(markdown);
    expect(parsed.metadata).toEqual({
      tags: [],
      aliases: []
    });
    expect(parsed.tags).toEqual(["tag"]);
    expect(parsed.diagnostics).toEqual([]);
  });

  it("returns a loud fallback for malformed YAML frontmatter", () => {
    const markdown = `---
title: [unterminated
---
Body should remain untouched`;
    const parsed = parseFrontmatter(markdown);

    expect(parsed.body).toBe(markdown);
    expect(parsed.metadata).toEqual({
      tags: [],
      aliases: []
    });
    expect(parsed.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "frontmatter_yaml_error",
          severity: "error"
        })
      ])
    );
  });

  it("reports an unclosed frontmatter fence without throwing", () => {
    const markdown = "---\ntitle: Missing Close\nBody";
    const parsed = parseFrontmatter(markdown);

    expect(parsed.body).toBe(markdown);
    expect(parsed.frontmatter).toBeNull();
    expect(parsed.diagnostics).toEqual([
      {
        code: "frontmatter_missing_closing_fence",
        message: "YAML frontmatter starts with --- but has no closing --- fence.",
        severity: "error"
      }
    ]);
  });

  it("preserves unknown frontmatter fields through explicit serialization", () => {
    const parsed = parseFrontmatter(`---
title: Round Trip
tags: [one]
custom_field:
  source: user
  count: 2
created: legacy-user-field
---
Body`);

    const serialized = serializeNote({
      metadata: parsed.metadata,
      body: parsed.body
    });
    const reparsed = parseFrontmatter(serialized);
    const metadata = reparsed.metadata as NoteMetadata & {
      readonly custom_field: {
        readonly source: string;
        readonly count: number;
      };
      readonly created: string;
    };

    expect(reparsed.diagnostics).toEqual([]);
    expect(metadata.custom_field).toEqual({
      source: "user",
      count: 2
    });
    expect(metadata.created).toBe("legacy-user-field");
    expect(metadata.created_at).toBeUndefined();
    expect(reparsed.body).toBe("Body");
  });
});

describe("offsets reported against the original document", () => {
  const NOTE = "---\ntags: []\n---\n- [ ] Task and [[A Link]]";

  it("reports task offsets that slice the task out of the original markdown", () => {
    const [task] = parseNote(NOTE).tasks;

    expect(task).toBeDefined();
    expect(NOTE.slice(task!.startOffset, task!.endOffset)).toBe("- [ ] Task and [[A Link]]");
  });

  it("reports the task's real line number, counting the frontmatter block", () => {
    const [task] = parseNote(NOTE).tasks;

    expect(task!.line).toBe(4);
  });

  it("reports wiki link offsets that slice the link out of the original markdown", () => {
    const [link] = parseNote(NOTE).wikiLinks;

    expect(link).toBeDefined();
    expect(NOTE.slice(link!.startOffset, link!.endOffset)).toBe("[[A Link]]");
  });

  it("still ignores tags and links inside the frontmatter block", () => {
    const parsed = parseNote("---\nnote: see [[Hidden]] #hiddentag\n---\nbody #real");

    expect(parsed.wikiLinks).toHaveLength(0);
    expect(parsed.inlineTags).toEqual(["real"]);
  });
});
