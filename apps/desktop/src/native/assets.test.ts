import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://localhost/${encodeURI(path)}`
}));

const { createVaultAssetResolver } = await import("./assets");

describe("createVaultAssetResolver", () => {
  const resolve = createVaultAssetResolver("/vault", "notes/today.md");

  it("resolves a path relative to the note", () => {
    expect(resolve("img/cat.png")).toBe("asset://localhost//vault/notes/img/cat.png");
  });

  it("resolves a vault-absolute path", () => {
    expect(resolve("/assets/cat.png")).toBe("asset://localhost//vault/assets/cat.png");
  });

  it("resolves a parent-relative path that stays inside the vault", () => {
    expect(resolve("../shared/cat.png")).toBe("asset://localhost//vault/shared/cat.png");
  });

  it("refuses to escape the vault root", () => {
    expect(resolve("../../etc/passwd")).toBeNull();
  });

  it("returns null for an empty source", () => {
    expect(resolve("")).toBeNull();
  });

  it("resolves against the vault root for a note at the top level", () => {
    const topLevel = createVaultAssetResolver("/vault", "today.md");
    expect(topLevel("img/cat.png")).toBe("asset://localhost//vault/img/cat.png");
  });
});
