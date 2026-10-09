import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../native/fs", () => ({
  saveAndWriteTextFile: vi.fn(),
  pickAndReadTextFile: vi.fn()
}));

import { pickAndReadTextFile, saveAndWriteTextFile } from "../native/fs";
import { readPickedFile, writeJsonViaSaveDialog } from "./importExportFiles";

const write = vi.mocked(saveAndWriteTextFile);
const read = vi.mocked(pickAndReadTextFile);

beforeEach(() => {
  write.mockReset();
  read.mockReset();
});

describe("writing a document through the save dialog", () => {
  it("delegates the write to the native save-and-write command", async () => {
    write.mockResolvedValue(true);

    await expect(writeJsonViaSaveDialog("Export theme", "theme.json", "{}")).resolves.toBe(true);
    expect(write).toHaveBeenCalledWith("Export theme", "theme.json", "{}");
  });

  /** Dismissing a dialog is a non-event; the caller should stay quiet. */
  it("reports a cancel as a plain false", async () => {
    write.mockResolvedValue(false);

    await expect(writeJsonViaSaveDialog("Export theme", "theme.json", "{}")).resolves.toBe(false);
  });

  /**
   * A full disk or a read-only path is not a cancel. Returning the same
   * `false` for both is what let a failed export pass silently.
   */
  it("throws when the write fails", async () => {
    write.mockRejectedValue(new Error("The chosen file could not be written."));

    await expect(writeJsonViaSaveDialog("Export theme", "theme.json", "{}")).rejects.toThrow(
      /could not be written/i
    );
  });
});

describe("reading a document through the open dialog", () => {
  it("hands back the file's contents", async () => {
    read.mockResolvedValue({ path: "/tmp/in.json", contents: "{\"a\":1}" });

    await expect(readPickedFile("Import theme", ["tbtheme.json"])).resolves.toEqual({
      path: "/tmp/in.json",
      contents: "{\"a\":1}"
    });
    expect(read).toHaveBeenCalledWith("Import theme", ["tbtheme.json"]);
  });

  it("passes no filter when none is given", async () => {
    read.mockResolvedValue({ path: "/tmp/in.json", contents: "{}" });

    await readPickedFile("Import settings");

    expect(read).toHaveBeenCalledWith("Import settings", undefined);
  });

  it("reports a cancel as null", async () => {
    read.mockResolvedValue(null);

    await expect(readPickedFile("Import theme")).resolves.toBeNull();
  });

  it("throws when the file cannot be read", async () => {
    read.mockRejectedValue(new Error("The picked file could not be read."));

    await expect(readPickedFile("Import theme")).rejects.toThrow(/could not be read/i);
  });
});
