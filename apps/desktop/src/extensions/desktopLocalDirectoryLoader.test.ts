import { afterEach, describe, expect, it, vi } from "vitest";

import { createExtensionModuleImporter } from "./desktopLocalDirectoryLoader";

const trackUrls = () => {
  const created: string[] = [];
  const revoked: string[] = [];
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn((blob: Blob) => {
      void blob;
      const url = `blob:mock-${created.length}`;
      created.push(url);
      return url;
    }),
    revokeObjectURL: vi.fn((url: string) => revoked.push(url))
  });
  return { created, revoked };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createExtensionModuleImporter", () => {
  it("revokes the blob url once the module has been imported", async () => {
    const { created, revoked } = trackUrls();
    const namespace = { activate: () => undefined };
    const importer = createExtensionModuleImporter(async () => namespace);

    await expect(importer("export {};", "file:///ext/a/extension.js")).resolves.toBe(namespace);

    expect(created).toHaveLength(1);
    expect(revoked).toEqual(created);
  });

  it("revokes the blob url when the import fails", async () => {
    const { created, revoked } = trackUrls();
    const importer = createExtensionModuleImporter(async () => {
      throw new Error("syntax error");
    });

    await expect(importer("export {};", "file:///ext/a/extension.js")).rejects.toThrow(
      "syntax error"
    );

    expect(revoked).toEqual(created);
  });
});
