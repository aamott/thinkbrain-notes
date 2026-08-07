// @vitest-environment happy-dom
import type { ExtensionManifest } from "@thinkbrain/core";
import { describe, expect, it, vi } from "vitest";

import { createDesktopCommandRegistry, type DesktopCommandContext } from "../commands/commandRegistry";
import { createDesktopPanelRegistry } from "../panels/panelRegistry";
import { bootstrapExtensions } from "./bootstrap";
import { createDesktopExtensionHost } from "./desktopExtensionHost";
import { createLocalExtensions } from "./localExtensions";
import type { LoadExtensionResult, LocalDirectoryLoader } from "./localDirectoryLoader";

const manifest = (id = "sample"): ExtensionManifest => ({
  id,
  name: "Sample",
  version: "1.0.0",
  apiVersion: "^1.0.0",
  engines: { platform: ["desktop"] },
  activationEvents: ["onCommand:go"],
  capabilities: [],
  contributes: { commands: [{ id: "go", title: "Go" }], panels: [] }
});

const loaderFor = (results: Record<string, LoadExtensionResult>): LocalDirectoryLoader => ({
  load: async (directory) =>
    results[directory] ?? { extension: null, diagnostics: [] }
});

const ok = (directory: string, activate = vi.fn()): LoadExtensionResult => ({
  extension: { directory, manifest: manifest(), activate, deactivate: undefined },
  diagnostics: []
});

const setup = (results: Record<string, LoadExtensionResult>) => {
  const commands = createDesktopCommandRegistry([]);
  const panels = createDesktopPanelRegistry([]);
  const host = createDesktopExtensionHost({ commands, panels });
  const boot = bootstrapExtensions({ host, commands, panels, extensions: [] });
  const local = createLocalExtensions({ loader: loaderFor(results), bootstrap: boot });
  return { commands, boot, local };
};

describe("createLocalExtensions", () => {
  it("registers a loaded extension's contributions", async () => {
    const { commands, local } = setup({ "/ext/a": ok("/ext/a") });

    const outcome = await local.add("/ext/a");

    expect(outcome.loaded).toBe(true);
    expect(commands.get("sample.go")?.title).toBe("Go");
  });

  it("reports diagnostics and registers nothing when loading fails", async () => {
    const { commands, local, boot } = setup({
      "/ext/bad": {
        extension: null,
        diagnostics: [{ code: "manifest_unreadable", message: "no manifest", severity: "error" }]
      }
    });

    const outcome = await local.add("/ext/bad");

    expect(outcome.loaded).toBe(false);
    expect(outcome.diagnostics[0]?.message).toBe("no manifest");
    expect(commands.entries()).toEqual([]);
    expect(boot.entries()).toEqual([]);
  });

  it("refuses to add the same directory twice", async () => {
    const { local } = setup({ "/ext/a": ok("/ext/a") });
    await local.add("/ext/a");

    const outcome = await local.add("/ext/a");

    expect(outcome.loaded).toBe(false);
    expect(outcome.diagnostics[0]?.message).toMatch(/already/i);
  });

  it("removes an extension and its contributions", async () => {
    const { commands, local, boot } = setup({ "/ext/a": ok("/ext/a") });
    await local.add("/ext/a");

    await local.remove("sample");

    expect(commands.get("sample.go")).toBeUndefined();
    expect(boot.entries()).toEqual([]);
  });

  /**
   * Reload must dispose the previous activation before the replacement runs,
   * or the new registration collides with the old one on the same id.
   */
  it("reloads an activated extension from its directory", async () => {
    const firstActivate = vi.fn();
    const secondActivate = vi.fn();
    const results = { "/ext/a": ok("/ext/a", firstActivate) };
    const { commands, local, boot } = setup(results);
    await local.add("/ext/a");
    await commands.get("sample.go")?.handler({} as DesktopCommandContext);
    expect(firstActivate).toHaveBeenCalledTimes(1);

    results["/ext/a"] = ok("/ext/a", secondActivate);
    const outcome = await local.reload("sample");

    expect(outcome.loaded).toBe(true);
    expect(boot.entries()[0]?.status).toBe("registered");
    expect(commands.get("sample.go")?.title).toBe("Go");
  });

  it("leaves the extension unloaded when a reload fails", async () => {
    const results: Record<string, LoadExtensionResult> = { "/ext/a": ok("/ext/a") };
    const { commands, local, boot } = setup(results);
    await local.add("/ext/a");

    results["/ext/a"] = {
      extension: null,
      diagnostics: [{ code: "entry_unreadable", message: "gone", severity: "error" }]
    };
    const outcome = await local.reload("sample");

    expect(outcome.loaded).toBe(false);
    expect(boot.entries()).toEqual([]);
    expect(commands.get("sample.go")).toBeUndefined();
  });

  it("reports an unknown id rather than throwing", async () => {
    const { local } = setup({});

    const outcome = await local.reload("missing");

    expect(outcome.loaded).toBe(false);
    expect(outcome.diagnostics[0]?.message).toMatch(/not loaded/i);
  });
});
