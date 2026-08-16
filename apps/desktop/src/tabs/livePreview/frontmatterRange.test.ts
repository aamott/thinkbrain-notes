import { Text } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { findFrontmatterRange } from "./frontmatterRange";

const doc = (source: string): Text => Text.of(source.split("\n"));

describe("findFrontmatterRange", () => {
  it("finds a well-formed block at the start of the document", () => {
    const source = "---\ntitle: My Note\ntags: [a]\n---\n\n# Heading";
    expect(findFrontmatterRange(doc(source))).toEqual({
      from: 0,
      to: 32,
      firstLine: 1,
      lastLine: 4
    });
  });

  it("returns null when the document does not open with a fence", () => {
    expect(findFrontmatterRange(doc("# Heading\n\n---\na: b\n---"))).toBeNull();
  });

  it("returns null for an unterminated block", () => {
    expect(findFrontmatterRange(doc("---\ntitle: My Note\n"))).toBeNull();
  });

  it("returns null when the fence is immediately closed by a setext-style rule", () => {
    // "---\n---" is an empty block; there is nothing to display, and treating
    // it as frontmatter would swallow a legitimate horizontal rule pair.
    expect(findFrontmatterRange(doc("---\n---\n"))).toBeNull();
  });

  it("tolerates trailing whitespace on the fences", () => {
    const result = findFrontmatterRange(doc("---  \na: b\n---\t\n"));
    expect(result?.lastLine).toBe(3);
  });

  it("returns null for an empty document", () => {
    expect(findFrontmatterRange(doc(""))).toBeNull();
  });
});
