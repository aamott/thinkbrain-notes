// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JournalFieldDefinition } from "@thinkbrain/core";

import { AddFieldRow, type AddFieldRowProps } from "./AddFieldRow";

/**
 * D86: recording something new without leaving the entry.
 *
 * New fields default to a single-select list — the user picks from pills
 * rather than typing free text. Asking "one from a list, several, a number, or
 * a few words?" on the page you came to write on is the settings form in
 * disguise.
 */

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const CONTEXT: JournalFieldDefinition = {
  id: "context",
  label: "Context",
  type: "multi-select",
  options: ["baking", "reading"]
};

const render = async (overrides: Partial<AddFieldRowProps> = {}): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const props: AddFieldRowProps = {
    available: [],
    existingKeys: [],
    onAdd: () => undefined,
    ...overrides
  };
  await act(async () => root?.render(<AddFieldRow {...props} />));
  return container;
};

const open = async (host: HTMLElement): Promise<void> => {
  const button = host.querySelector<HTMLButtonElement>('button[aria-label="Add a field"]');
  await act(async () => button?.click());
};

const type = async (host: HTMLElement, text: string): Promise<void> => {
  const input = host.querySelector<HTMLInputElement>('input[aria-label="New field name"]');
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, text);
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const submit = async (host: HTMLElement): Promise<void> => {
  const input = host.querySelector<HTMLInputElement>('input[aria-label="New field name"]');
  await act(async () => {
    input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
};

describe("naming a new field", () => {
  it("stays out of the way until asked for", async () => {
    const host = await render();

    expect(host.querySelector('input[aria-label="New field name"]')).toBeNull();
  });

  it("creates a single-select field and shows the key it will write (D87)", async () => {
    const onAdd = vi.fn();
    const host = await render({ onAdd });

    await open(host);
    await type(host, "Weather");
    expect(host.textContent).toContain("weather");
    await submit(host);

    expect(onAdd).toHaveBeenCalledWith({ id: "weather", label: "Weather", type: "single-select", options: [] });
  });

  it("derives a usable key from an awkward name", async () => {
    const onAdd = vi.fn();
    const host = await render({ onAdd });

    await open(host);
    await type(host, "How I slept");
    await submit(host);

    expect(onAdd).toHaveBeenCalledWith({
      id: "how-i-slept",
      label: "How I slept",
      type: "single-select",
      options: []
    });
  });

  it("refuses a name the app already owns", async () => {
    const onAdd = vi.fn();
    const host = await render({ onAdd });

    await open(host);
    await type(host, "Tags");
    await submit(host);

    expect(onAdd).not.toHaveBeenCalled();
    expect(host.textContent).toContain("already used by the app");
  });

  it("refuses a key this entry already has", async () => {
    const onAdd = vi.fn();
    const host = await render({ existingKeys: ["mood"], onAdd });

    await open(host);
    await type(host, "Mood");
    await submit(host);

    expect(onAdd).not.toHaveBeenCalled();
    expect(host.textContent).toContain("already on this entry");
  });

  it("does nothing on an empty name", async () => {
    const onAdd = vi.fn();
    const host = await render({ onAdd });

    await open(host);
    await submit(host);

    expect(onAdd).not.toHaveBeenCalled();
  });

  it("closes on Escape", async () => {
    const host = await render();

    await open(host);
    const input = host.querySelector<HTMLInputElement>('input[aria-label="New field name"]');
    await act(async () => {
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(host.querySelector('input[aria-label="New field name"]')).toBeNull();
  });
});

describe("picking a field already set up", () => {
  it("offers the ones this entry is not already showing", async () => {
    const onAdd = vi.fn();
    const host = await render({ available: [CONTEXT], onAdd });

    await open(host);
    const option = host.querySelector<HTMLButtonElement>('button[aria-label="Add Context"]');
    await act(async () => option?.click());

    expect(onAdd).toHaveBeenCalledWith(CONTEXT);
  });

  it("keeps its own shape rather than becoming free text", async () => {
    const onAdd = vi.fn();
    const host = await render({ available: [CONTEXT], onAdd });

    await open(host);
    await type(host, "Context");
    await submit(host);

    expect(onAdd).toHaveBeenCalledWith(CONTEXT);
  });

  it("says nothing about your fields when there are none left to offer", async () => {
    const host = await render({ available: [] });

    await open(host);

    expect(host.textContent).not.toContain("Your fields");
  });
});
