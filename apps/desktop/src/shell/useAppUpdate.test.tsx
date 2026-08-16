// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAppUpdate, type AvailableUpdate, type UpdateState } from "./useAppUpdate";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

/** The last state the hook reported, plus its two actions. */
interface Harness {
  state: UpdateState;
  install: () => void;
  dismiss: () => void;
}

const mount = async (
  check: (() => Promise<AvailableUpdate | null>) | null,
  relaunch: () => Promise<void> = () => Promise.resolve()
): Promise<Harness> => {
  const harness = {} as Harness;
  function Probe() {
    Object.assign(harness, useAppUpdate(check, relaunch));
    return null;
  }
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<Probe />));
  return harness;
};

const anUpdate = (overrides: Partial<AvailableUpdate> = {}): AvailableUpdate => ({
  version: "0.2.0",
  downloadAndInstall: () => Promise.resolve(),
  ...overrides
});

describe("useAppUpdate", () => {
  it("says nothing when there is no update", async () => {
    const harness = await mount(() => Promise.resolve(null));
    expect(harness.state).toEqual({ kind: "none" });
  });

  it("does not check at all where there is no updater", async () => {
    const harness = await mount(null);
    expect(harness.state).toEqual({ kind: "none" });
  });

  /**
   * A failed check is the app's problem, not the user's: they did not ask, and
   * there is nothing for them to do about it. Nagging about it on every launch
   * would train them to ignore the one notice that matters.
   */
  it("stays quiet when the check itself fails", async () => {
    const harness = await mount(() => Promise.reject(new Error("offline")));
    expect(harness.state).toEqual({ kind: "none" });
  });

  it("reports the version it found", async () => {
    const harness = await mount(() => Promise.resolve(anUpdate({ version: "0.4.1" })));
    expect(harness.state).toEqual({ kind: "available", version: "0.4.1" });
  });

  it("restarts once the update is installed", async () => {
    const relaunch = vi.fn(() => Promise.resolve());
    const downloadAndInstall = vi.fn(() => Promise.resolve());
    const harness = await mount(
      () => Promise.resolve(anUpdate({ downloadAndInstall })),
      relaunch
    );

    await act(async () => harness.install());

    expect(downloadAndInstall).toHaveBeenCalled();
    expect(relaunch).toHaveBeenCalled();
  });

  /**
   * A half-installed update that restarted anyway is how a working app becomes
   * one that will not open. The failure is worth saying out loud, unlike a
   * failed check, because the user pressed a button and deserves an answer.
   */
  it("does not restart when the install failed, and says so", async () => {
    const relaunch = vi.fn(() => Promise.resolve());
    const harness = await mount(
      () =>
        Promise.resolve(
          anUpdate({ downloadAndInstall: () => Promise.reject(new Error("disk full")) })
        ),
      relaunch
    );

    await act(async () => harness.install());

    expect(relaunch).not.toHaveBeenCalled();
    expect(harness.state).toEqual({ kind: "failed", message: "disk full" });
  });

  it("shows it is working, so a slow download does not look like a dead button", async () => {
    let finish = () => undefined as void;
    const harness = await mount(() =>
      Promise.resolve(
        anUpdate({ downloadAndInstall: () => new Promise<void>((resolve) => (finish = resolve)) })
      )
    );

    let installed: Promise<void> | undefined;
    await act(async () => {
      installed = Promise.resolve(harness.install());
    });
    expect(harness.state).toEqual({ kind: "installing" });

    await act(async () => {
      finish();
      await installed;
    });
  });

  it("stops asking for the rest of the session once dismissed", async () => {
    const harness = await mount(() => Promise.resolve(anUpdate()));
    expect(harness.state).toEqual({ kind: "available", version: "0.2.0" });

    await act(async () => harness.dismiss());

    expect(harness.state).toEqual({ kind: "none" });
  });
});
