// @vitest-environment happy-dom
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Menu, MenuButton, type MenuCloseReason } from "./Menu";

/**
 * The one menu surface, tested once.
 *
 * Every menu in the app used to carry its own copy of this — the right-click
 * menu in the file tree, the toolbar dropdown, the workspace switcher — and
 * they disagreed about half of it. Now they share, which makes this the place
 * a mistake in any of them would show up.
 */

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.restoreAllMocks();
});

const render = async (element: React.ReactElement): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(element));
  return container;
};

const items = (host: HTMLElement) => [...host.querySelectorAll<HTMLButtonElement>("[role='menuitem']")];

const press = async (key: string, target: EventTarget = window) => {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
};

const threeItems = (onClose: (reason: MenuCloseReason) => void = () => undefined, current?: string) => (
  <Menu label="Test menu" className="absolute" onClose={onClose}>
    {["One", "Two", "Three"].map((label) => (
      <MenuButton key={label} label={label} current={label === current} onClick={() => undefined} />
    ))}
  </Menu>
);

describe("where a menu puts focus", () => {
  it("lands on the first item, so it can be driven without a mouse", async () => {
    const host = await render(threeItems());

    expect(document.activeElement).toBe(items(host)[0]);
  });

  /// Opening a list of workspaces on the one you are already in is the
  /// difference between reading it and searching it.
  it("lands on the item that is already the answer, when there is one", async () => {
    const host = await render(threeItems(() => undefined, "Two"));

    expect(document.activeElement).toBe(items(host)[1]);
  });
});

describe("driving a menu from the keyboard", () => {
  it("steps down and wraps round the end", async () => {
    const host = await render(threeItems());
    const [first, second, third] = items(host);

    await press("ArrowDown", first);
    expect(document.activeElement).toBe(second);
    await press("ArrowDown", second);
    expect(document.activeElement).toBe(third);
    await press("ArrowDown", third);
    expect(document.activeElement).toBe(first);
  });

  it("steps up and wraps round the start", async () => {
    const host = await render(threeItems());
    const [first, , third] = items(host);

    await press("ArrowUp", first);
    expect(document.activeElement).toBe(third);
  });
});

describe("how a menu closes", () => {
  it("closes on Escape, and says that is why", async () => {
    const onClose = vi.fn();
    const host = await render(threeItems(onClose));

    await press("Escape", items(host)[0]);

    expect(onClose).toHaveBeenCalledWith("escape");
  });

  /// Focus can leave a menu — by Tab, or by something that took it — and
  /// Escape has to stay the way out.
  it("closes on Escape even when focus has left it", async () => {
    const onClose = vi.fn();
    await render(threeItems(onClose));

    await act(async () => (document.activeElement as HTMLElement)?.blur());
    await press("Escape");

    expect(onClose).toHaveBeenCalledWith("escape");
  });

  it("closes when the pointer goes down somewhere else, and says that is why", async () => {
    const onClose = vi.fn();
    await render(threeItems(onClose));

    const elsewhere = document.createElement("button");
    document.body.append(elsewhere);
    await act(async () => elsewhere.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })));

    expect(onClose).toHaveBeenCalledWith("outside");
    elsewhere.remove();
  });

  it("stays open when the pointer goes down on one of its own items", async () => {
    const onClose = vi.fn();
    const host = await render(threeItems(onClose));

    await act(async () => items(host)[0]?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })));

    expect(onClose).not.toHaveBeenCalled();
  });

  /// Without this, the press that closes a toggle counts as an outside click
  /// first, and the menu shuts and reopens in the same gesture.
  it("does not treat its own trigger as somewhere else", async () => {
    const onClose = vi.fn();

    function Anchored() {
      const trigger = useRef<HTMLButtonElement>(null);
      return (
        <div>
          <button ref={trigger} type="button">Open</button>
          <Menu label="Anchored" className="absolute" anchorRef={trigger} onClose={onClose}>
            <MenuButton label="One" onClick={() => undefined} />
          </Menu>
        </div>
      );
    }

    const host = await render(<Anchored />);
    const trigger = host.querySelector("button");
    await act(async () => trigger?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })));

    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("a menu raised at the pointer", () => {
  // happy-dom measures every element as a zero rect; the flip logic needs a
  // real size, so the menu's is stubbed.
  const stubMenuRect = (width: number, height: number) =>
    vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0 } as DOMRect);

  it("opens exactly where the pointer was", async () => {
    await render(
      <Menu label="At the pointer" at={{ x: 120, y: 240 }} onClose={() => undefined}>
        <MenuButton label="One" onClick={() => undefined} />
      </Menu>
    );

    // Pointer-placed menus portal to document.body so no ancestor's clip or
    // stacking context can sit them under a scrollbar — and they are placed
    // once, at the pointer, so they can never paint and then jump.
    const menu = document.querySelector<HTMLDivElement>("[role='menu']");
    expect(menu?.style.left).toBe("120px");
    expect(menu?.style.top).toBe("240px");
  });

  it("keeps its top at the pointer while there is still room below", async () => {
    stubMenuRect(160, 120);
    await render(
      <Menu label="At the pointer" at={{ x: 120, y: 240 }} onClose={() => undefined}>
        <MenuButton label="One" onClick={() => undefined} />
      </Menu>
    );

    const menu = document.querySelector<HTMLDivElement>("[role='menu']");
    expect(menu?.style.top).toBe("240px");
  });

  it("anchors its bottom edge at the pointer when it would run off the window's", async () => {
    stubMenuRect(160, 120);
    const y = window.innerHeight - 20; // 100px short of fitting below
    await render(
      <Menu label="At the pointer" at={{ x: 120, y }} onClose={() => undefined}>
        <MenuButton label="One" onClick={() => undefined} />
      </Menu>
    );

    const menu = document.querySelector<HTMLDivElement>("[role='menu']");
    expect(menu?.style.top).toBe(`${y - 120}px`);
  });

  it("anchors its right edge at the pointer when it would run off the window's", async () => {
    stubMenuRect(160, 120);
    const x = window.innerWidth - 20; // 140px short of fitting rightward
    await render(
      <Menu label="At the pointer" at={{ x, y: 240 }} onClose={() => undefined}>
        <MenuButton label="One" onClick={() => undefined} />
      </Menu>
    );

    const menu = document.querySelector<HTMLDivElement>("[role='menu']");
    expect(menu?.style.left).toBe(`${x - 160}px`);
  });

  it("clamps to the window's top when the menu is taller than the space above the pointer", async () => {
    stubMenuRect(160, window.innerHeight + 50); // taller than the window itself
    await render(
      <Menu label="At the pointer" at={{ x: 120, y: window.innerHeight - 20 }} onClose={() => undefined}>
        <MenuButton label="One" onClick={() => undefined} />
      </Menu>
    );

    const menu = document.querySelector<HTMLDivElement>("[role='menu']");
    expect(menu?.style.top).toBe("0px");
  });
});
