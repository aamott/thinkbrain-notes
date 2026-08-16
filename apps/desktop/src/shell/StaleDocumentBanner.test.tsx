// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StaleDocumentBanner } from "./StaleDocumentBanner";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

async function renderBanner(fileName = "attention-costs.md") {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const onKeepMine = vi.fn();
  const onLoadFromDisk = vi.fn();

  await act(async () => {
    root?.render(
      <StaleDocumentBanner
        fileName={fileName}
        onKeepMine={onKeepMine}
        onLoadFromDisk={onLoadFromDisk}
      />
    );
  });

  const button = (label: RegExp) =>
    Array.from(container?.querySelectorAll("button") ?? []).find((candidate) =>
      label.test(candidate.textContent ?? "")
    );

  return { onKeepMine, onLoadFromDisk, button, text: () => container?.textContent ?? "" };
}

describe("the notice that a note changed on disk", () => {
  it("says what happened and that nothing was lost", async () => {
    const { text } = await renderBanner();

    expect(text()).toMatch(/changed on disk while you were editing it/i);
    expect(text()).toMatch(/nothing has been replaced/i);
  });

  it("names the note it is talking about", async () => {
    const { text } = await renderBanner("reading-log.md");

    expect(text()).toMatch(/reading-log\.md/);
  });

  /**
   * A screen reader should hear this without the keyboard being taken away.
   * The user did not ask for it and may be mid-sentence, so unlike the
   * unsaved-close dialog this neither traps focus nor moves it.
   */
  it("announces itself without stealing focus", async () => {
    await renderBanner();
    const notice = container?.querySelector('[role="status"]');

    expect(notice?.getAttribute("aria-live")).toBe("polite");
    expect(document.activeElement).toBe(document.body);
  });

  it("offers to load what is on disk", async () => {
    const { onLoadFromDisk, onKeepMine, button } = await renderBanner();

    await act(async () => button(/load the disk version/i)?.click());

    expect(onLoadFromDisk).toHaveBeenCalledTimes(1);
    expect(onKeepMine).not.toHaveBeenCalled();
  });

  /**
   * Keeping your version only dismisses the notice. Overwriting the newer file
   * should take the same deliberate save it always takes, not fall out of
   * clearing a message.
   */
  it("offers to keep your version, which only dismisses", async () => {
    const { onKeepMine, onLoadFromDisk, button } = await renderBanner();

    await act(async () => button(/keep mine/i)?.click());

    expect(onKeepMine).toHaveBeenCalledTimes(1);
    expect(onLoadFromDisk).not.toHaveBeenCalled();
  });

  it("puts both answers in the keyboard's path", async () => {
    const { button } = await renderBanner();

    for (const label of [/keep mine/i, /load the disk version/i]) {
      const control = button(label);
      expect(control?.tagName).toBe("BUTTON");
      expect(control?.getAttribute("disabled")).toBeNull();
    }
  });
});
