// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JournalFieldDefinition } from "@thinkbrain/core";

import { MetadataField, type MetadataFieldProps } from "./MetadataField";

/**
 * D83/D84: the vocabulary is open.
 *
 * A value the options no longer contain still reads back, and a value that was
 * never there can be added to one note without editing anybody's settings.
 */

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const MOOD: JournalFieldDefinition = {
  id: "mood",
  label: "Mood",
  type: "single-select",
  options: ["rough", "okay", "good"]
};
const CONTEXT: JournalFieldDefinition = {
  id: "context",
  label: "Context",
  type: "multi-select",
  options: ["baking", "reading"]
};

const render = async (overrides: Partial<MetadataFieldProps> = {}): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const props: MetadataFieldProps = {
    definition: MOOD,
    value: undefined,
    onSet: () => undefined,
    ...overrides
  };
  await act(async () => root?.render(<MetadataField {...props} />));
  return container;
};

const pill = (host: HTMLElement, name: string): HTMLButtonElement => {
  const found = host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
  if (!found) throw new Error(`No control named "${name}"`);
  return found;
};

describe("a value the options no longer contain (D83)", () => {
  it("offers it as a choice, already chosen", async () => {
    const host = await render({ value: "uber happy" });

    expect(pill(host, "Mood: uber happy").getAttribute("aria-pressed")).toBe("true");
  });

  it("marks it as not one of the configured choices", async () => {
    const host = await render({ value: "uber happy" });

    // Said in the accessible description rather than only by styling, because
    // "this one is yours alone" is not something a colour can convey.
    expect(pill(host, "Mood: uber happy").title).toContain("only on this entry");
  });

  it("keeps the configured choices alongside it", async () => {
    const host = await render({ value: "uber happy" });

    expect(host.querySelectorAll('[aria-pressed]')).toHaveLength(4);
    expect(pill(host, "Mood: good").getAttribute("aria-pressed")).toBe("false");
  });

  it("does not offer it twice when it is also configured", async () => {
    const host = await render({ value: "good" });

    expect(host.querySelectorAll('[aria-pressed]')).toHaveLength(3);
  });

  it("keeps the rest of a multi-select while healing one value", async () => {
    const onSet = vi.fn();
    const host = await render({
      definition: CONTEXT,
      value: ["baking", "knitting"],
      onSet
    });

    expect(pill(host, "Context: knitting").getAttribute("aria-pressed")).toBe("true");

    // Touching another value must carry the healed one along, not drop it.
    await act(async () => pill(host, "Context: reading").click());
    expect(onSet).toHaveBeenCalledWith(["baking", "knitting", "reading"]);
  });

  it("lets it be cleared like any other choice", async () => {
    const onSet = vi.fn();
    const host = await render({ value: "uber happy", onSet });

    await act(async () => pill(host, "Mood: uber happy").click());

    expect(onSet).toHaveBeenCalledWith(undefined);
  });
});

describe("adding a value that was never there (D84)", () => {
  const add = async (host: HTMLElement, text: string): Promise<void> => {
    await act(async () => pill(host, "Add a value to Mood").click());
    const input = host.querySelector<HTMLInputElement>('input[aria-label="New value for Mood"]');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, text);
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
  };

  it("records it on the note", async () => {
    const onSet = vi.fn();
    const host = await render({ onSet });

    await add(host, "uber happy");

    expect(onSet).toHaveBeenCalledWith("uber happy");
  });

  it("adds to a multi-select rather than replacing it", async () => {
    const onSet = vi.fn();
    const host = await render({ definition: CONTEXT, value: ["baking"], onSet });

    await act(async () => pill(host, "Add a value to Context").click());
    const input = host.querySelector<HTMLInputElement>('input[aria-label="New value for Context"]');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "knitting");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    expect(onSet).toHaveBeenCalledWith(["baking", "knitting"]);
  });

  it("ignores blank input rather than writing an empty value", async () => {
    const onSet = vi.fn();
    const host = await render({ onSet });

    await add(host, "   ");

    expect(onSet).not.toHaveBeenCalled();
  });

  it("selects an existing choice rather than duplicating it", async () => {
    const onSet = vi.fn();
    const host = await render({ onSet });

    await add(host, "good");

    expect(onSet).toHaveBeenCalledWith("good");
    expect(host.querySelectorAll('[aria-pressed]')).toHaveLength(3);
  });

  it("closes on Escape without recording anything", async () => {
    const onSet = vi.fn();
    const host = await render({ onSet });

    await act(async () => pill(host, "Add a value to Mood").click());
    const input = host.querySelector<HTMLInputElement>('input[aria-label="New value for Mood"]');
    await act(async () => {
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(onSet).not.toHaveBeenCalled();
    expect(host.querySelector('input[aria-label="New value for Mood"]')).toBeNull();
  });

  it("is offered on select fields only", async () => {
    const host = await render({
      definition: { id: "energy", label: "Energy", type: "number" },
      value: 7
    });

    expect(host.querySelector('button[aria-label="Add a value to Energy"]')).toBeNull();
  });
});
