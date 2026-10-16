import { describe, expect, it, vi } from "vitest";

const openUrlPlugin = vi.fn<(url: string) => Promise<void>>();

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: (url: string) => openUrlPlugin(url)
}));

import { openUrl } from "./opener";

describe("openUrl", () => {
  it("hands the URL to the opener plugin", async () => {
    openUrlPlugin.mockResolvedValue(undefined);
    await openUrl("https://example.com");
    expect(openUrlPlugin).toHaveBeenCalledWith("https://example.com");
  });

  it("rejects with a normalized error when the plugin fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    openUrlPlugin.mockRejectedValue({ code: "NOT_FOUND", message: "no handler" });
    await expect(openUrl("mailto:a@b.c")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
