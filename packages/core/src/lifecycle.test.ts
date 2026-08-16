import { describe, expect, it } from "vitest";

import {
  createDisposableStore,
  createExtensionHost,
  DisposableError,
  DuplicateExtensionError,
  ExtensionActivationError,
  ExtensionDeactivationError,
  InvalidExtensionIdError,
  UntrustedExtensionError,
  type Disposable,
  type ExtensionDefinition
} from "./lifecycle";

describe("disposable store", () => {
  it("disposes resources in reverse order and is idempotent", () => {
    const calls: string[] = [];
    const store = createDisposableStore();
    store.add({ dispose: () => { calls.push("first"); } });
    const second = store.add({ dispose: () => { calls.push("second"); } });

    second.dispose();
    second.dispose();
    store.dispose();
    store.dispose();

    expect(calls).toEqual(["second", "first"]);
  });

  it("disposes a resource added after store disposal immediately", () => {
    let disposed = 0;
    const store = createDisposableStore();
    store.dispose();

    store.add({ dispose: () => { disposed += 1; } });

    expect(disposed).toBe(1);
  });

  it("reports synchronous and asynchronous disposal failures", async () => {
    const synchronous = createDisposableStore();
    synchronous.add({ dispose: () => { throw new Error("sync failure"); } });
    expect(() => synchronous.dispose()).toThrow(DisposableError);

    const asynchronous = createDisposableStore();
    asynchronous.add({ dispose: async () => { throw new Error("async failure"); } });
    await expect(asynchronous.dispose()).rejects.toBeInstanceOf(DisposableError);
  });

  it("shares an in-flight asynchronous disposal with concurrent callers", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const store = createDisposableStore();
    store.add({ dispose: async () => gate });

    const first = store.dispose();
    const second = store.dispose();
    expect(second).toBe(first);
    release?.();
    await first;
  });
});

describe("extension host", () => {
  const definition = (
    id: string,
    activate: ExtensionDefinition["activate"],
    deactivate?: ExtensionDefinition["deactivate"]
  ): ExtensionDefinition => ({ id, trusted: true, activate, deactivate });

  it("rejects extension IDs outside lowercase kebab-case", () => {
    const host = createExtensionHost();

    for (const id of ["", "One", "one.two", "one_two", "1one", "one-"]) {
      expect(() => host.register(definition(id, () => undefined)))
        .toThrow(InvalidExtensionIdError);
    }
  });

  it("registers trusted extensions, exposes status, and rejects duplicates", async () => {
    const host = createExtensionHost();
    const extension = definition("one", () => undefined);
    const registration = host.register(extension);

    expect(host.status("one")).toBe("registered");
    expect(host.statuses()).toEqual([{ id: "one", status: "registered" }]);
    expect(() => host.register(extension)).toThrow(DuplicateExtensionError);
    await host.activate("one");
    expect(host.status("one")).toBe("active");

    await host.deactivate("one");
    expect(host.status("one")).toBe("inactive");
    await registration.dispose();
    expect(host.status("one")).toBeUndefined();
  });

  it("rejects explicitly untrusted extensions", () => {
    const host = createExtensionHost();

    expect(() => host.register({
      id: "untrusted",
      trusted: false,
      activate: () => undefined
    })).toThrow(UntrustedExtensionError);
  });

  it("runs activation and deactivation hooks and cleans owned resources", async () => {
    const calls: string[] = [];
    const host = createExtensionHost();
    host.register(definition(
      "hooks",
      (context) => {
        context.subscriptions.add({ dispose: () => { calls.push("resource"); } });
        calls.push("activate");
      },
      () => { calls.push("deactivate"); }
    ));

    await host.activate("hooks");
    await host.activate("hooks");
    expect(calls).toEqual(["activate"]);
    await host.deactivate("hooks");
    expect(calls).toEqual(["activate", "deactivate", "resource"]);
    await host.deactivate("hooks");
    expect(calls).toEqual(["activate", "deactivate", "resource"]);
  });

  it("cleans activation resources and reports typed activation failures", async () => {
    const calls: string[] = [];
    const host = createExtensionHost();
    host.register(definition("broken", (context) => {
      context.subscriptions.add({ dispose: () => { calls.push("cleanup"); } });
      throw new Error("activation failure");
    }));

    await expect(host.activate("broken")).rejects.toBeInstanceOf(ExtensionActivationError);
    expect(host.status("broken")).toBe("failed");
    expect(calls).toEqual(["cleanup"]);
  });

  it("reports cleanup failures while still finishing deactivation", async () => {
    const host = createExtensionHost();
    host.register(definition("cleanup-error", (context) => {
      context.subscriptions.add({ dispose: () => { throw new Error("cleanup failure"); } });
    }, () => {
      throw new Error("hook failure");
    }));

    await host.activate("cleanup-error");
    await expect(host.deactivate("cleanup-error")).rejects.toBeInstanceOf(ExtensionDeactivationError);
    expect(host.status("cleanup-error")).toBe("inactive");
  });

  it("accepts disposables returned from activation and disposes on host shutdown", async () => {
    let disposed = 0;
    const returned: Disposable = { dispose: () => { disposed += 1; } };
    const host = createExtensionHost();
    host.register(definition("returned", () => returned));

    await host.activate("returned");
    await host.dispose();
    await host.dispose();

    expect(disposed).toBe(1);
    expect(host.status("returned")).toBeUndefined();
  });

  it("cleans up when unregistered while activation is still pending", async () => {
    let releaseActivation: (() => void) | undefined;
    const activationGate = new Promise<void>((resolve) => {
      releaseActivation = resolve;
    });
    const calls: string[] = [];
    const host = createExtensionHost();
    const registration = host.register(definition("pending", async (context) => {
      context.subscriptions.add({ dispose: () => { calls.push("cleanup"); } });
      await activationGate;
    }));

    const activation = host.activate("pending");
    const disposal = registration.dispose();
    releaseActivation?.();
    await activation;
    await disposal;

    expect(calls).toEqual(["cleanup"]);
    expect(host.status("pending")).toBeUndefined();
  });

  it("rejects activation after host disposal", async () => {
    const host = createExtensionHost();
    host.register(definition("late", () => undefined));
    await host.dispose();

    await expect(host.activate("late")).rejects.toThrow("host has been disposed");
  });

  it("shares in-flight host disposal with concurrent callers", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const host = createExtensionHost();
    host.register(definition("slow", async () => gate));
    const activation = host.activate("slow");
    const first = host.dispose();
    const second = host.dispose();

    expect(second).toBe(first);
    release?.();
    await activation;
    await first;
  });

  it("clears the host and attempts every deactivation despite failures", async () => {
    const calls: string[] = [];
    const host = createExtensionHost();
    host.register(definition("first-failure", () => undefined, () => {
      calls.push("first");
      throw new Error("first failure");
    }));
    host.register(definition("second-failure", () => undefined, () => {
      calls.push("second");
      throw new Error("second failure");
    }));

    await host.activate("first-failure");
    await host.activate("second-failure");
    let disposalError: unknown;
    try {
      await host.dispose();
    } catch (error: unknown) {
      disposalError = error;
    }
    expect(disposalError).toBeInstanceOf(DisposableError);

    expect(calls).toEqual(expect.arrayContaining(["first", "second"]));
    expect(host.statuses()).toEqual([]);
    await host.dispose();
  });
});
