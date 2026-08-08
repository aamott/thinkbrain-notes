import { describe, expect, it } from "vitest";

import { createLocalDirectoryLoader, type ExtensionFileReader } from "./localDirectoryLoader";

const MANIFEST = {
  id: "sample",
  name: "Sample",
  version: "1.0.0",
  apiVersion: "^1.0.0",
  activationEvents: ["onCommand:greet"],
  contributes: { commands: [{ id: "greet", title: "Greet" }] }
};

/** Builds a reader over an in-memory directory. */
function reader(files: Record<string, string>): ExtensionFileReader {
  return async (directory, relativePath) => {
    const contents = files[relativePath];
    if (contents === undefined) {
      throw new Error(`${directory}/${relativePath} does not exist`);
    }
    return contents;
  };
}

const activate = (): void => undefined;

const loader = (
  files: Record<string, string>,
  importModule: (code: string, sourceUrl: string) => Promise<unknown> = async () => ({ activate })
) => createLocalDirectoryLoader({ readFile: reader(files), importModule });

const validFiles = {
  "extension.json": JSON.stringify(MANIFEST),
  "extension.js": "export function activate() {}"
};

describe("createLocalDirectoryLoader", () => {
  it("loads a valid directory into a manifest and activate pair", async () => {
    const result = await loader(validFiles).load("/ext/sample");

    expect(result.diagnostics).toEqual([]);
    expect(result.extension?.manifest.id).toBe("sample");
    expect(result.extension?.activate).toBe(activate);
    expect(result.extension?.directory).toBe("/ext/sample");
  });

  it("passes the entry source and a file:// source url to the importer", async () => {
    const seen: { code: string; sourceUrl: string }[] = [];
    const load = loader(validFiles, async (code, sourceUrl) => {
      seen.push({ code, sourceUrl });
      return { activate };
    });

    await load.load("/ext/sample");

    expect(seen[0]?.code).toBe("export function activate() {}");
    expect(seen[0]?.sourceUrl).toBe("file:///ext/sample/extension.js");
  });

  it("honours a manifest main pointing at a bundled subdirectory", async () => {
    const files = {
      "extension.json": JSON.stringify({ ...MANIFEST, main: "dist/bundle.js" }),
      "dist/bundle.js": "bundled"
    };
    const seen: string[] = [];
    const load = loader(files, async (code) => {
      seen.push(code);
      return { activate };
    });

    const result = await load.load("/ext/sample");

    expect(result.diagnostics).toEqual([]);
    expect(seen).toEqual(["bundled"]);
  });

  it("reports a missing manifest without importing anything", async () => {
    let imported = false;
    const load = loader({}, async () => {
      imported = true;
      return { activate };
    });

    const result = await load.load("/ext/sample");

    expect(result.extension).toBeNull();
    expect(result.diagnostics[0]?.code).toBe("manifest_unreadable");
    expect(imported).toBe(false);
  });

  it("reports malformed manifest JSON", async () => {
    const result = await loader({ "extension.json": "{ not json" }).load("/ext/sample");

    expect(result.extension).toBeNull();
    expect(result.diagnostics[0]?.code).toBe("manifest_invalid_json");
  });

  it("reports every manifest diagnostic at once", async () => {
    const result = await loader({
      "extension.json": JSON.stringify({ id: "Bad Id", name: "" })
    }).load("/ext/sample");

    expect(result.extension).toBeNull();
    expect(result.diagnostics.length).toBeGreaterThan(1);
  });

  it("refuses an extension that is incompatible with the host", async () => {
    const result = await loader({
      ...validFiles,
      "extension.json": JSON.stringify({ ...MANIFEST, apiVersion: "^99.0.0" })
    }).load("/ext/sample");

    expect(result.extension).toBeNull();
    expect(result.diagnostics.some((d) => d.code === "api-version")).toBe(true);
  });

  it("reports a missing entry module", async () => {
    const result = await loader({ "extension.json": JSON.stringify(MANIFEST) }).load("/ext/sample");

    expect(result.extension).toBeNull();
    expect(result.diagnostics[0]?.code).toBe("entry_unreadable");
  });

  it("reports an entry module that throws while being imported", async () => {
    const load = loader(validFiles, async () => {
      throw new Error("boom");
    });

    const result = await load.load("/ext/sample");

    expect(result.extension).toBeNull();
    expect(result.diagnostics[0]?.code).toBe("entry_import_failed");
    expect(result.diagnostics[0]?.message).toContain("boom");
  });

  it("reports an entry module with no activate export", async () => {
    const load = loader(validFiles, async () => ({ setup: () => undefined }));

    const result = await load.load("/ext/sample");

    expect(result.extension).toBeNull();
    expect(result.diagnostics[0]?.code).toBe("entry_missing_activate");
  });

  it("rejects a main that escapes the extension directory before reading it", async () => {
    const reads: string[] = [];
    const load = createLocalDirectoryLoader({
      readFile: async (_directory, relativePath) => {
        reads.push(relativePath);
        return JSON.stringify({ ...MANIFEST, main: "../evil.js" });
      },
      importModule: async () => ({ activate })
    });

    const result = await load.load("/ext/sample");

    expect(result.extension).toBeNull();
    expect(result.diagnostics[0]?.code).toBe("entry_escapes_directory");
    expect(reads).toEqual(["extension.json"]);
  });

  it("keeps declared panels, which mount their own DOM", async () => {
    const panels = [{ id: "stats", label: "Stats", icon: "S", side: "right" as const }];
    const result = await loader({
      ...validFiles,
      "extension.json": JSON.stringify({
        ...MANIFEST,
        contributes: { ...MANIFEST.contributes, panels }
      })
    }).load("/ext/sample");

    expect(result.extension?.manifest.contributes.panels).toEqual(panels);
    expect(result.diagnostics.find((d) => d.code === "panels_not_supported")).toBeUndefined();
  });
});
