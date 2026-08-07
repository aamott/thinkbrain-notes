import { describe, expect, it } from "vitest";

import { resolveEntryPath, validateExtensionModule } from "./loader";

describe("resolveEntryPath", () => {
  it("defaults to extension.js when the manifest omits main", () => {
    expect(resolveEntryPath(undefined)).toEqual({ path: "extension.js", diagnostic: null });
  });

  it("accepts a relative .js or .mjs path in a subdirectory", () => {
    expect(resolveEntryPath("dist/main.mjs")).toEqual({
      path: "dist/main.mjs",
      diagnostic: null
    });
  });

  it.each([
    ["/etc/passwd", "absolute"],
    ["C:\\windows\\system32\\evil.js", "absolute"],
    ["../outside.js", "parent"],
    ["dist/../../outside.js", "parent"]
  ])("rejects %s because it escapes the extension directory", (main) => {
    const result = resolveEntryPath(main);

    expect(result.path).toBeNull();
    expect(result.diagnostic?.severity).toBe("error");
  });

  it("rejects an entry that is not a JavaScript module", () => {
    const result = resolveEntryPath("main.ts");

    expect(result.path).toBeNull();
    expect(result.diagnostic?.code).toBe("entry_not_javascript");
  });

  it("rejects a non-string main", () => {
    const result = resolveEntryPath(42 as unknown as string);

    expect(result.path).toBeNull();
    expect(result.diagnostic?.severity).toBe("error");
  });
});

describe("validateExtensionModule", () => {
  it("accepts a module exporting a callable activate", () => {
    const activate = (): void => undefined;

    expect(validateExtensionModule({ activate })).toEqual({
      module: { activate, deactivate: undefined },
      diagnostic: null
    });
  });

  it("accepts an optional callable deactivate", () => {
    const activate = (): void => undefined;
    const deactivate = (): void => undefined;

    expect(validateExtensionModule({ activate, deactivate })).toEqual({
      module: { activate, deactivate },
      diagnostic: null
    });
  });

  it("rejects a module with no activate export", () => {
    const result = validateExtensionModule({ setup: () => undefined });

    expect(result.module).toBeNull();
    expect(result.diagnostic?.code).toBe("entry_missing_activate");
  });

  it("rejects an activate export that is not callable", () => {
    const result = validateExtensionModule({ activate: "yes" });

    expect(result.module).toBeNull();
    expect(result.diagnostic?.code).toBe("entry_missing_activate");
  });

  it("rejects a non-callable deactivate rather than ignoring it", () => {
    const result = validateExtensionModule({ activate: () => undefined, deactivate: 1 });

    expect(result.module).toBeNull();
    expect(result.diagnostic?.code).toBe("entry_invalid_deactivate");
  });

  it("rejects a module namespace that is not an object", () => {
    expect(validateExtensionModule(null).module).toBeNull();
    expect(validateExtensionModule("module").module).toBeNull();
  });
});
