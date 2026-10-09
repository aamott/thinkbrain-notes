// @vitest-environment happy-dom
import type { ExtensionManifest } from "@thinkbrain/core";
import { describe, expect, it, vi } from "vitest";

import { createDesktopCommandRegistry, type DesktopCommandContext } from "../commands/commandRegistry";
import { createDesktopPanelRegistry } from "../panels/panelRegistryModel";
import { bootstrapExtensions } from "./bootstrap";
import { createDesktopExtensionHost } from "./desktopExtensionHost";
import { createLocalExtensions, type ExtensionDirectoryStore } from "./localExtensions";
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

const memoryStore = (initial: readonly string[] = []): ExtensionDirectoryStore & {
  readonly saved: () => readonly string[];
} => {
  let directories = initial;
  return {
    load: async () => directories,
    save: async (next) => {
      directories = next;
    },
    saved: () => directories
  };
};

const setup = (
  results: Record<string, LoadExtensionResult>,
  directories?: ExtensionDirectoryStore
) => {
  const commands = createDesktopCommandRegistry([]);
  const panels = createDesktopPanelRegistry([]);
  const host = createDesktopExtensionHost({ commands, panels });
  const boot = bootstrapExtensions({ host, commands, panels, extensions: [] });
  const local = createLocalExtensions({ loader: loaderFor(results), bootstrap: boot, directories });
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

  /**
   * Directory identity is filesystem identity, not string identity: a trailing
   * slash or different separator style still names the same directory and must
   * not double-load it.
   */
  it.each(["/ext/a/", "/ext/a//"])("refuses the alias %s of a loaded directory", async (alias) => {
    const { local } = setup({ "/ext/a": ok("/ext/a") });
    await local.add("/ext/a");

    const outcome = await local.add(alias);

    expect(outcome.loaded).toBe(false);
    expect(outcome.diagnostics[0]?.code).toBe("directory_already_loaded");
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

  /**
   * `remove` must only act on directory-loaded extensions: it resolves the
   * directory through `bootstrap.entries()`, which a built-in never populates,
   * so the guard must stop the call before `removeLocalExtension` can dispose
   * the built-in's registrations.
   */
  it("leaves a built-in extension alone when asked to remove it", async () => {
    const commands = createDesktopCommandRegistry([]);
    const panels = createDesktopPanelRegistry([]);
    const host = createDesktopExtensionHost({ commands, panels });
    const boot = bootstrapExtensions({
      host,
      commands,
      panels,
      extensions: [{ manifest: manifest("builtin"), activate: vi.fn() }]
    });
    const local = createLocalExtensions({ loader: loaderFor({}), bootstrap: boot });

    await local.remove("builtin");

    expect(boot.entries().map((entry) => entry.id)).toEqual(["builtin"]);
    expect(commands.get("builtin.go")?.title).toBe("Go");
  });
});

describe("directory persistence", () => {
  it("persists a successfully added directory and unpersists it on remove", async () => {
    const store = memoryStore();
    const { local } = setup({ "/ext/a": ok("/ext/a") }, store);

    await local.add("/ext/a");
    expect(store.saved()).toEqual(["/ext/a"]);

    await local.remove("sample");
    expect(store.saved()).toEqual([]);
  });

  it("does not persist a directory that failed to load", async () => {
    const store = memoryStore();
    const { local } = setup(
      {
        "/ext/bad": {
          extension: null,
          diagnostics: [{ code: "manifest_unreadable", message: "no manifest", severity: "error" }]
        }
      },
      store
    );

    await local.add("/ext/bad");

    expect(store.saved()).toEqual([]);
  });

  it("restores stored directories at startup", async () => {
    const store = memoryStore(["/ext/a"]);
    const { commands, local } = setup({ "/ext/a": ok("/ext/a") }, store);

    await local.restore();

    expect(commands.get("sample.go")?.title).toBe("Go");
    expect(store.saved()).toEqual(["/ext/a"]);
  });

  it("keeps a failing stored directory listed and reports why", async () => {
    const store = memoryStore(["/ext/gone"]);
    const { local } = setup(
      {
        "/ext/gone": {
          extension: null,
          diagnostics: [{ code: "manifest_unreadable", message: "no manifest", severity: "error" }]
        }
      },
      store
    );
    const listener = vi.fn();
    local.subscribe(listener);

    await local.restore();

    expect(store.saved()).toEqual(["/ext/gone"]);
    expect(local.startupFailures()).toEqual([
      {
        directory: "/ext/gone",
        diagnostics: [{ code: "manifest_unreadable", message: "no manifest", severity: "error" }]
      }
    ]);
    expect(listener).toHaveBeenCalled();
  });

  /**
   * A stored directory that never loaded has no extension id for `remove` to
   * resolve — `forget` is its removal path: unpersisted, cleared from the
   * failures list, and subscribers notified.
   */
  it("forgets a failing stored directory and clears its failure", async () => {
    const store = memoryStore(["/ext/gone"]);
    const { local } = setup(
      {
        "/ext/gone": {
          extension: null,
          diagnostics: [{ code: "manifest_unreadable", message: "no manifest", severity: "error" }]
        }
      },
      store
    );
    const listener = vi.fn();
    local.subscribe(listener);
    await local.restore();
    expect(local.startupFailures()).toHaveLength(1);

    await local.forget("/ext/gone");

    expect(store.saved()).toEqual([]);
    expect(local.startupFailures()).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("forgets a directory spelled with a trailing separator", async () => {
    const store = memoryStore(["/ext/gone"]);
    const { local } = setup(
      {
        "/ext/gone": {
          extension: null,
          diagnostics: [{ code: "manifest_unreadable", message: "no manifest", severity: "error" }]
        }
      },
      store
    );
    await local.restore();

    await local.forget("/ext/gone/");

    expect(store.saved()).toEqual([]);
    expect(local.startupFailures()).toEqual([]);
  });

  it("keeps a failure listed when forgetting its directory cannot be saved", async () => {
    const directories: readonly string[] = ["/ext/gone"];
    const store: ExtensionDirectoryStore = {
      load: async () => directories,
      save: async () => {
        throw new Error("disk full");
      }
    };
    const { local } = setup(
      {
        "/ext/gone": {
          extension: null,
          diagnostics: [{ code: "manifest_unreadable", message: "no manifest", severity: "error" }]
        }
      },
      store
    );
    await local.restore();

    await expect(local.forget("/ext/gone")).rejects.toThrow("disk full");

    // The write failed, so the directory is still stored — the failure must
    // stay visible rather than claiming a removal that did not happen.
    expect(local.startupFailures()).toHaveLength(1);
  });

  it("retries a failed directory through add once it is fixed", async () => {
    const store = memoryStore(["/ext/a"]);
    const results: Record<string, LoadExtensionResult> = {
      "/ext/a": {
        extension: null,
        diagnostics: [{ code: "entry_unreadable", message: "gone", severity: "error" }]
      }
    };
    const { commands, local } = setup(results, store);
    await local.restore();
    expect(local.startupFailures()).toHaveLength(1);

    results["/ext/a"] = ok("/ext/a");
    const outcome = await local.add("/ext/a");

    expect(outcome.loaded).toBe(true);
    expect(commands.get("sample.go")?.title).toBe("Go");
    expect(local.startupFailures()).toEqual([]);
    // Already stored — the retry writes the same single entry, not a dupe.
    expect(store.saved()).toEqual(["/ext/a"]);
  });

  it("clears a startup failure when a later restore succeeds", async () => {
    const store = memoryStore(["/ext/a"]);
    const results: Record<string, LoadExtensionResult> = {
      "/ext/a": {
        extension: null,
        diagnostics: [{ code: "entry_unreadable", message: "gone", severity: "error" }]
      }
    };
    const { local } = setup(results, store);
    await local.restore();
    expect(local.startupFailures()).toHaveLength(1);

    results["/ext/a"] = ok("/ext/a");
    await local.restore();

    expect(local.startupFailures()).toEqual([]);
    expect(store.saved()).toEqual(["/ext/a"]);
  });

  /**
   * Persistence is not part of the load outcome: the extension is already
   * registered when `save` runs, so a store failure must surface as a warning
   * on a still-successful add rather than a rejection the user cannot retry.
   */
  it("reports a persist failure as a warning on an otherwise loaded extension", async () => {
    const store: ExtensionDirectoryStore = {
      load: async () => [],
      save: async () => {
        throw new Error("disk full");
      }
    };
    const { local, commands } = setup({ "/ext/a": ok("/ext/a") }, store);
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const outcome = await local.add("/ext/a");
      expect(outcome.loaded).toBe(true);
      expect(outcome.diagnostics.at(-1)).toMatchObject({
        code: "directory_persist_failed",
        severity: "warning"
      });
    } finally {
      spy.mockRestore();
    }
    expect(commands.get("sample.go")?.title).toBe("Go");
  });

  it("does not reject remove when forgetting the directory fails", async () => {
    let directories: readonly string[] = [];
    const store: ExtensionDirectoryStore = {
      load: async () => directories,
      save: async (next) => {
        if (next.length === 0) throw new Error("disk full");
        directories = next;
      }
    };
    const { local, boot } = setup({ "/ext/a": ok("/ext/a") }, store);
    await local.add("/ext/a");
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await expect(local.remove("sample")).resolves.toBeUndefined();
    } finally {
      spy.mockRestore();
    }
    expect(boot.entries()).toEqual([]);
  });

  it("works without a directory store", async () => {
    const { local } = setup({ "/ext/a": ok("/ext/a") });

    await local.restore();
    const outcome = await local.add("/ext/a");

    expect(outcome.loaded).toBe(true);
    expect(local.startupFailures()).toEqual([]);
  });
});
