import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DocumentChain, DocumentChainOptions } from "../native/documentChain";

/**
 * Wiring tests only. The chain's ordering/conflict semantics are covered by
 * native/documentChain.test.ts; here we prove this module forwards the right
 * command names, rootPath, contents, precondition, and conflict code — and that
 * its exported functions reach the singleton chain.
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

import {
  readWorkspaceSettingsDocument,
  updateWorkspaceSettingsDocument
} from "./workspaceSettingsFile";

const options = mocks.options!;

beforeEach(() => {
  // Clear call state without dropping the captured singleton options.
  mocks.chainRead.mockReset();
  mocks.chainUpdate.mockReset();
  mocks.invoke.mockReset();
});

describe("the workspace settings document", () => {
  it("reads through the singleton chain under the exact workspace rootPath", async () => {
    mocks.chainRead.mockResolvedValue("doc");

    await expect(readWorkspaceSettingsDocument("/vault-a")).resolves.toBe("doc");
    await readWorkspaceSettingsDocument("/vault-b");

    expect(mocks.chainRead).toHaveBeenNthCalledWith(1, "/vault-a");
    expect(mocks.chainRead).toHaveBeenNthCalledWith(2, "/vault-b");
  });

  it("updates through the singleton chain and forwards the revise callback unchanged", async () => {
    mocks.chainUpdate.mockResolvedValue("written-doc");
    const revise = (current: string | null): string => current ?? "";

    await expect(updateWorkspaceSettingsDocument("/vault-a", revise)).resolves.toBe(
      "written-doc"
    );
    expect(mocks.chainUpdate).toHaveBeenCalledWith("/vault-a", revise);
  });

  it("configures the workspace settings conflict code", () => {
    expect(options.conflictCode).toBe("settings.workspace_conflict");
  });

  it("reads through read_workspace_settings with the workspace rootPath", async () => {
    mocks.invoke.mockResolvedValue("doc");

    await expect(options.read("/vault")).resolves.toBe("doc");
    expect(mocks.invoke).toHaveBeenCalledWith("read_workspace_settings", {
      rootPath: "/vault"
    });
  });

  it("writes through write_workspace_settings with rootPath, contents, and precondition", async () => {
    await options.write("/vault", "next-doc", "current-doc");
    expect(mocks.invoke).toHaveBeenCalledWith("write_workspace_settings", {
      rootPath: "/vault",
      contents: "next-doc",
      expected: "current-doc"
    });
  });
});
