import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DocumentChain, DocumentChainOptions } from "../native/documentChain";

/**
 * Wiring tests only. The chain's ordering/conflict semantics are covered by
 * native/documentChain.test.ts; here we prove this module forwards the right
 * command names, contents, precondition, key, and conflict code — and that its
 * exported functions reach the singleton chain.
 */

const mocks = vi.hoisted(() => ({
  options: undefined as DocumentChainOptions | undefined,
  chainRead: vi.fn<DocumentChain["read"]>(),
  chainUpdate: vi.fn<DocumentChain["update"]>(),
  invoke: vi.fn<(command: string, args?: Record<string, unknown>) => Promise<unknown>>()
}));

vi.mock("../native/documentChain", () => ({
  createDocumentChain: vi.fn((options: DocumentChainOptions): DocumentChain => {
    mocks.options = options;
    return { read: mocks.chainRead, update: mocks.chainUpdate };
  })
}));

vi.mock("../native/commands", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../native/commands")>()),
  invokeNativeCommand: mocks.invoke
}));

import { readAppSettingsDocument, updateAppSettingsDocument } from "./appSettingsFile";

const options = mocks.options!;

beforeEach(() => {
  // Clear call state without dropping the captured singleton options.
  mocks.chainRead.mockReset();
  mocks.chainUpdate.mockReset();
  mocks.invoke.mockReset();
});

describe("the app settings document", () => {
  it("reads through the singleton chain under the constant app key", async () => {
    mocks.chainRead.mockResolvedValue("doc");

    await expect(readAppSettingsDocument()).resolves.toBe("doc");
    expect(mocks.chainRead).toHaveBeenCalledWith("app");
  });

  it("updates through the singleton chain and forwards the revise callback unchanged", async () => {
    mocks.chainUpdate.mockResolvedValue("written-doc");
    const revise = (current: string | null): string => current ?? "";

    await expect(updateAppSettingsDocument(revise)).resolves.toBe("written-doc");
    expect(mocks.chainUpdate).toHaveBeenCalledWith("app", revise);
  });

  it("configures the app settings conflict code", () => {
    expect(options.conflictCode).toBe("settings.app_conflict");
  });

  it("reads through read_app_settings", async () => {
    mocks.invoke.mockResolvedValue("doc");

    await expect(options.read("app")).resolves.toBe("doc");
    expect(mocks.invoke).toHaveBeenCalledWith("read_app_settings");
  });

  it("writes through write_app_settings with contents and precondition", async () => {
    await options.write("app", "next-doc", "current-doc");
    expect(mocks.invoke).toHaveBeenCalledWith("write_app_settings", {
      contents: "next-doc",
      expected: "current-doc"
    });
  });

  it("passes a null precondition through", async () => {
    await options.write("app", "next-doc", null);
    expect(mocks.invoke).toHaveBeenCalledWith("write_app_settings", {
      contents: "next-doc",
      expected: null
    });
  });
});
