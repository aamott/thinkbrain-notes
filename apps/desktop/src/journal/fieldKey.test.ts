import { describe, expect, it } from "vitest";

import { deriveFieldKey } from "./fieldKey";

describe("deriveFieldKey", () => {
  it("converts a label to a valid frontmatter key (D49)", () => {
    expect(deriveFieldKey("How I slept")).toBe("how-i-slept");
  });

  it("keeps the key if it's already clean", () => {
    expect(deriveFieldKey("mood")).toBe("mood");
  });

  it("removes leading and trailing non-alphanumeric characters", () => {
    expect(deriveFieldKey("---mood---")).toBe("mood");
  });

  it("replaces runs of non-alphanumeric characters with a single dash", () => {
    expect(deriveFieldKey("How  I  slept")).toBe("how-i-slept");
    expect(deriveFieldKey("How_I_slept")).toBe("how-i-slept");
    expect(deriveFieldKey("How-I-slept")).toBe("how-i-slept");
  });

  it("trims whitespace", () => {
    expect(deriveFieldKey("  mood  ")).toBe("mood");
  });

  it("prefixes a key starting with a digit (D49's rule)", () => {
    expect(deriveFieldKey("123")).toBe("f-123");
    expect(deriveFieldKey("5-star rating")).toBe("f-5-star-rating");
  });

  it("does not prefix a key already starting with a letter", () => {
    expect(deriveFieldKey("a123")).toBe("a123");
  });
});
