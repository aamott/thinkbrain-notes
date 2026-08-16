import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../native/dialogs", () => ({
  saveFilePath: vi.fn(),
  pickFilePath: vi.fn()
}));
vi.mock("../native/fs", () => ({
  writeTextFileNative: vi.fn(),
  readTextFileNative: vi.fn()
}));

import { pickFilePath, saveFilePath } from "../native/dialogs";
import { readTextFileNative, writeTextFileNative } from "../native/fs";
import { readPickedFile, writeJsonViaSaveDialog } from "./importExportFiles";

const save = vi.mocked(saveFilePath);
const pick = vi.mocked(pickFilePath);
const write = vi.mocked(writeTextFileNative);
const read = vi.mocked(readTextFileNative);

beforeEach(() => {
  save.mockReset();
  pick.mockReset();
  write.mockReset();
  read.mockReset();
});

describe("writing a document through the save dialog", () => {
  it("writes what it was given to the chosen path", async () => {
    save.mockResolvedValue("/tmp/out.json");
    write.mockResolvedValue(true);

    await expect(writeJsonViaSaveDialog("Export theme", "theme.json", "{}")).resolves.toBe(true);
    expect(write).toHaveBeenCalledWith("/tmp/out.json", "{}");
    expect(save).toHaveBeenCalledWith("Export theme", "theme.json");
  });

  /** Dismissing a dialog is a non-event; the caller should stay quiet. */
  it("reports a cancel as a plain false", async () => {
    save.mockResolvedValue(null);

    await expect(writeJsonViaSaveDialog("Export theme", "theme.json", "{}")).resolves.toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  /**
   * A full disk or a read-only path is not a cancel. Returning the same
   * `false` for both is what let a failed export pass silently.
   */
  it("throws when the write fails", async () => {
    save.mockResolvedValue("/tmp/out.json");
    write.mockResolvedValue(false);

    await expect(writeJsonViaSaveDialog("Export theme", "theme.json", "{}")).rejects.toThrow(
      /could not be written/i
    );
  });
});

describe("reading a document through the open dialog", () => {
  it("hands back the file's contents", async () => {
    pick.mockResolvedValue("/tmp/in.json");
    read.mockResolvedValue("{\"a\":1}");

    await expect(readPickedFile("Import theme", ["tbtheme.json"])).resolves.toEqual({
      path: "/tmp/in.json",
      contents: "{\"a\":1}"
    });
    expect(pick).toHaveBeenCalledWith("Import theme", ["tbtheme.json"]);
  });

  it("passes no filter when none is given", async () => {
    pick.mockResolvedValue("/tmp/in.json");
    read.mockResolvedValue("{}");

    await readPickedFile("Import settings");

    expect(pick).toHaveBeenCalledWith("Import settings", undefined);
  });

  it("reports a cancel as null", async () => {
    pick.mockResolvedValue(null);

    await expect(readPickedFile("Import theme")).resolves.toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it("throws when the file cannot be read", async () => {
    pick.mockResolvedValue("/tmp/in.json");
    read.mockResolvedValue(null);

    await expect(readPickedFile("Import theme")).rejects.toThrow(/could not be read/i);
  });
});
