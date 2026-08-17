// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UpdateBanner } from "./UpdateBanner";
import type { UpdateState } from "./useAppUpdate";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

async function renderBanner(state: UpdateState) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const onInstall = vi.fn();
  const onDismiss = vi.fn();

  await act(async () => {
    root?.render(<UpdateBanner state={state} onInstall={onInstall} onDismiss={onDismiss} />);
  });

  const button = (label: RegExp) =>
    Array.from(container?.querySelectorAll("button") ?? []).find((candidate) =>
      label.test(candidate.textContent ?? "")
    );

  return { onInstall, onDismiss, button };
}

describe("update banner", () => {
  /**
   * The shell lays its rows out in a fixed grid, and a component that renders
   * nothing does not merely disappear — it gives up its row, and everything
   * below it slides up into the wrong one. So the banner always occupies its
   * place, and is simply empty when it has nothing to say.
   *
   * It also has to exist before it has anything to announce: a screen reader
   * that meets a live region and its content in the same update commonly
   * announces neither.
   */
  it("keeps its place in the layout when there is no update", async () => {
    await renderBanner({ kind: "none" });

    const region = container?.querySelector("[role='status']");
    expect(region).not.toBeNull();
    expect(region?.getAttribute("aria-live")).toBe("polite");
    expect(container?.textContent).toBe("");
    expect(container?.querySelectorAll("button")).toHaveLength(0);
  });

  it("offers an available version, and says the app will restart", async () => {
    const { button } = await renderBanner({ kind: "available", version: "0.2.0" });

    expect(container?.textContent).toContain("0.2.0");
    expect(container?.textContent).toContain("save anything you are partway through");
    expect(button(/Install and restart/)).toBeDefined();
    expect(button(/Not now/)).toBeDefined();
  });

  it("installs on request and dismisses on request", async () => {
    const { onInstall, onDismiss, button } = await renderBanner({
      kind: "available",
      version: "0.2.0"
    });

    await act(async () => button(/Install and restart/)?.click());
    await act(async () => button(/Not now/)?.click());

    expect(onInstall).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  /** Mid-install there is nothing useful to press, and cancelling is not real. */
  it("offers nothing to press while installing", async () => {
    await renderBanner({ kind: "installing" });

    expect(container?.querySelectorAll("button")).toHaveLength(0);
    expect(container?.querySelector("[role='status']")?.getAttribute("aria-busy")).toBe("true");
  });

  /** A failed install has to say the app still works, or it reads as a broken app. */
  it("reports a failed install without implying damage", async () => {
    const { button } = await renderBanner({ kind: "failed", message: "Network unreachable." });

    expect(container?.textContent).toContain("Network unreachable.");
    expect(container?.textContent).toContain("this version still works");
    expect(button(/Dismiss/)).toBeDefined();
    expect(button(/Install and restart/)).toBeUndefined();
  });
});
