// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useDismissable } from "./use-dismissable";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const Panel = ({
  open,
  onDismiss,
  extra
}: {
  open: boolean;
  onDismiss: () => void;
  extra?: boolean;
}) => {
  const { containerRef } = useDismissable({ open, onDismiss });
  return (
    <div ref={containerRef} data-tn-panel="">
      <button type="button">inside</button>
      {extra ? <button type="button">second</button> : null}
    </div>
  );
};

const render = async (element: React.ReactElement): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(element));
  return container;
};

describe("useDismissable", () => {
  it("dismisses on Escape while open", async () => {
    const onDismiss = vi.fn();
    await render(<Panel open onDismiss={onDismiss} />);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("ignores Escape while closed", async () => {
    const onDismiss = vi.fn();
    await render(<Panel open={false} onDismiss={onDismiss} />);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("moves focus into the panel on open and restores it on close", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const onDismiss = vi.fn();

    await render(<Panel open onDismiss={onDismiss} />);
    expect(document.activeElement?.textContent).toBe("inside");

    await act(async () => root?.render(<Panel open={false} onDismiss={onDismiss} />));
    expect(document.activeElement).toBe(opener);

    opener.remove();
  });

  it("restores focus when the panel unmounts while still open", async () => {
    // The idiomatic `{open && <Sheet />}` call site unmounts the hook instead
    // of re-rendering it closed. React runs cleanups on unmount, never effect
    // bodies, so without a mount-scoped cleanup the restore target is dropped
    // and the keyboard user lands on <body>.
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const onDismiss = vi.fn();

    await render(<Panel open onDismiss={onDismiss} />);
    expect(document.activeElement?.textContent).toBe("inside");

    await act(async () => root?.unmount());
    root = null;

    expect(document.activeElement).toBe(opener);

    opener.remove();
  });

  it("dismisses the top-most overlay when several are open", async () => {
    const dismissLower = vi.fn();
    const dismissTop = vi.fn();
    await render(
      <>
        <Panel open onDismiss={dismissLower} />
        <Panel open onDismiss={dismissTop} />
      </>
    );

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(dismissTop).toHaveBeenCalledOnce();
    expect(dismissLower).not.toHaveBeenCalled();
  });

  it("traps Tab within the open panel", async () => {
    const onDismiss = vi.fn();
    const host = await render(<Panel open extra onDismiss={onDismiss} />);
    const panel = host.querySelector("[data-tn-panel]");
    const [first, second] = host.querySelectorAll("button");
    if (!panel || !first || !second) throw new Error("expected two buttons");

    second.focus();
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })
      );
    });
    expect(document.activeElement).toBe(first);

    first.focus();
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Tab",
          shiftKey: true,
          bubbles: true,
          cancelable: true
        })
      );
    });
    expect(document.activeElement).toBe(second);
    expect(panel.contains(document.activeElement)).toBe(true);
  });
});
