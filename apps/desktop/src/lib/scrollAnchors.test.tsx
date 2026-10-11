// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useRef } from "react";
import { afterEach, describe, expect, it } from "vitest";

import {
  captureRegisteredScrollAnchors,
  captureScrollAnchor,
  clearScrollAnchorSnapshots,
  readScrollAnchorSnapshot,
  restoreRegisteredScrollAnchors,
  restoreScrollAnchor,
  SCROLL_ANCHOR_ATTR,
  useScrollAnchor
} from "./scrollAnchors";

/** Rectangles in happy-dom are all zero; every assertion needs real boxes. */
function mockRect(el: Element, top: number, height = 20, left = 0, width = 200): void {
  const rect = {
    top,
    bottom: top + height,
    left,
    right: left + width,
    height,
    width,
    x: left,
    y: top,
    toJSON: () => ({})
  } as DOMRect;
  Object.defineProperty(el, "getBoundingClientRect", {
    configurable: true,
    value: () => rect
  });
}

function mockClientHeight(el: Element, height: number): void {
  Object.defineProperty(el, "clientHeight", { configurable: true, value: height });
}

/** A container with three row anchors and two section anchors. */
function buildScroller(): {
  container: HTMLDivElement;
  rows: HTMLElement[];
  section: HTMLElement;
} {
  const container = document.createElement("div");
  mockClientHeight(container, 500);
  mockRect(container, 100, 500);
  const section = document.createElement("section");
  section.setAttribute(SCROLL_ANCHOR_ATTR, "section:app:ui");
  const rows: HTMLElement[] = [];
  for (const key of ["row.a", "row.b", "row.c"]) {
    const row = document.createElement("div");
    row.setAttribute(SCROLL_ANCHOR_ATTR, key);
    section.appendChild(row);
    rows.push(row);
  }
  container.appendChild(section);
  document.body.appendChild(container);
  return { container, rows, section };
}

afterEach(() => {
  clearScrollAnchorSnapshots();
  document.body.innerHTML = "";
});

describe("captureScrollAnchor", () => {
  it("picks the first visible row anchor with its container-relative offset", () => {
    const { container, rows, section } = buildScroller();
    mockRect(section, 0, 600); // whole section above/partly visible
    mockRect(rows[0]!, -60); // scrolled above the container top (100)
    mockRect(rows[1]!, 140); // visible
    mockRect(rows[2]!, 700); // below the container bottom (600)
    container.scrollTop = 80;

    const snap = captureScrollAnchor(container);
    expect(snap.key).toBe("row.b");
    expect(snap.offset).toBe(40); // 140 - 100
    expect(snap.scrollTop).toBe(80);
  });

  it("prefers the anchor containing the focused element", () => {
    const { container, rows } = buildScroller();
    mockRect(rows[0]!, 140);
    mockRect(rows[1]!, 300);
    mockRect(rows[2]!, 460);
    rows[2]!.focus();
    const snap = captureScrollAnchor(container);
    expect(snap.key).toBe("row.c");
    expect(snap.offset).toBe(360);
  });

  it("falls back to a section anchor when no row is visible", () => {
    const { container, rows, section } = buildScroller();
    mockRect(section, 300, 900);
    mockRect(rows[0]!, -300);
    mockRect(rows[1]!, -250);
    mockRect(rows[2]!, -200);
    const snap = captureScrollAnchor(container);
    expect(snap.key).toBe("section:app:ui");
  });

  it("reports key:null when nothing is visible", () => {
    const { container, rows, section } = buildScroller();
    mockRect(section, -900, 300);
    rows.forEach((r) => mockRect(r, -500));
    container.scrollTop = 321;
    const snap = captureScrollAnchor(container);
    expect(snap.key).toBeNull();
    expect(snap.scrollTop).toBe(321);
  });
});

describe("restoreScrollAnchor", () => {
  it("shifts scrollTop by the anchor's drift", () => {
    const { container, rows } = buildScroller();
    mockRect(rows[1]!, 200); // was at 140 when captured with offset 40
    container.scrollTop = 80;
    restoreScrollAnchor(container, { key: "row.b", offset: 40, scrollTop: 80 });
    expect(container.scrollTop).toBe(140); // 80 + (200-100) - 40
  });

  it("falls back to the raw scrollTop when the anchor is gone", () => {
    const { container } = buildScroller();
    container.scrollTop = 0;
    restoreScrollAnchor(container, { key: "missing.key", offset: 40, scrollTop: 77 });
    expect(container.scrollTop).toBe(77);
  });
});

describe("registered scrollers", () => {
  it("captures and restores registered containers only", async () => {
    let unmount: (() => void) | null = null;
    const Probe = ({ active = true }: { readonly active?: boolean }) => {
      const ref = useRef<HTMLDivElement>(null);
      useScrollAnchor(ref, "probe", active);
      return (
        <div ref={ref}>
          <div {...{ [SCROLL_ANCHOR_ATTR]: "row.x" }} />
        </div>
      );
    };
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root: Root = createRoot(host);
    await act(async () => root.render(<Probe />));
    unmount = () => root.unmount();

    const container = host.querySelector<HTMLDivElement>("div")!;
    const row = container.querySelector("div")!;
    mockClientHeight(container, 500);
    mockRect(container, 0, 500);
    mockRect(row, 50);
    container.scrollTop = 10;
    await act(async () => {
      container.dispatchEvent(new Event("scroll"));
    });

    const snaps = captureRegisteredScrollAnchors();
    expect(snaps.size).toBe(1);

    // Simulate a reflow: the row moved down 30px.
    mockRect(row, 80);
    restoreRegisteredScrollAnchors(snaps);
    expect(container.scrollTop).toBe(40);

    await act(async () => unmount!());
  });
});

describe("useScrollAnchor across hide/show", () => {
  it("saves the last valid snapshot on deactivate and restores on remount", async () => {
    const Probe = ({ active = true }: { readonly active?: boolean }) => {
      const ref = useRef<HTMLDivElement>(null);
      useScrollAnchor(ref, "surface", active);
      return (
        <div ref={ref}>
          <div {...{ [SCROLL_ANCHOR_ATTR]: "row.x" }} />
        </div>
      );
    };
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(<Probe />));

    const container = host.querySelector<HTMLDivElement>("div")!;
    const row = container.querySelector("div")!;
    mockClientHeight(container, 500);
    mockRect(container, 0, 500);
    mockRect(row, 60);
    container.scrollTop = 40;
    await act(async () => {
      container.dispatchEvent(new Event("scroll"));
    });

    // Deactivate while the element still has layout — snapshot saved.
    await act(async () => root.render(<Probe active={false} />));
    container.scrollTop = 0;
    // A fresh mount lays the row out at its un-scrolled content offset.
    mockRect(row, 160);

    // Reactivate: restore shifts scrollTop so the row lands at the saved
    // viewport offset of 60 — i.e. scrollTop = 160 - 60.
    await act(async () => root.render(<Probe />));
    expect(container.scrollTop).toBe(100);

    await act(async () => root.unmount());
  });

  it("does not overwrite the snapshot when deactivated while hidden", async () => {
    const Probe = ({ active = true }: { readonly active?: boolean }) => {
      const ref = useRef<HTMLDivElement>(null);
      useScrollAnchor(ref, "surface2", active);
      return (
        <div ref={ref}>
          <div {...{ [SCROLL_ANCHOR_ATTR]: "row.x" }} />
        </div>
      );
    };
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(<Probe />));

    const container = host.querySelector<HTMLDivElement>("div")!;
    const row = container.querySelector("div")!;
    mockClientHeight(container, 500);
    mockRect(container, 0, 500);
    mockRect(row, 60);
    container.scrollTop = 40;
    await act(async () => {
      container.dispatchEvent(new Event("scroll"));
    });

    // Now hidden: clientHeight 0 and no rects — cleanup must keep the
    // last recorded snapshot instead of capturing a collapsed one.
    mockClientHeight(container, 0);
    await act(async () => root.render(<Probe active={false} />));
    container.scrollTop = 0;

    // Shown again — restore uses the pre-hide anchor. Same fresh-mount
    // layout: the row sits at its un-scrolled content offset.
    mockClientHeight(container, 500);
    mockRect(row, 160);
    await act(async () => root.render(<Probe />));
    expect(container.scrollTop).toBe(100);

    await act(async () => root.unmount());
  });
});

describe("useScrollAnchor keying", () => {
  const Probe = ({ cacheKey, active = true }: { readonly cacheKey: string; readonly active?: boolean }) => {
    const ref = useRef<HTMLDivElement>(null);
    useScrollAnchor(ref, cacheKey, active);
    return (
      <div ref={ref}>
        <div {...{ [SCROLL_ANCHOR_ATTR]: "row.x" }} />
      </div>
    );
  };

  it("a new key starts at the top instead of inheriting another key's position", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(<Probe cacheKey="ws:a" />));

    const container = host.querySelector<HTMLDivElement>("div")!;
    const row = container.querySelector("div")!;
    mockClientHeight(container, 500);
    mockRect(container, 0, 500);
    mockRect(row, 60);
    container.scrollTop = 40;
    await act(async () => {
      container.dispatchEvent(new Event("scroll"));
    });
    expect(readScrollAnchorSnapshot("ws:a")?.scrollTop).toBe(40);

    // Switch to an unvisited key: no snapshot exists for it, so the
    // surface must reset to the top — not keep ws:a's position.
    await act(async () => root.render(<Probe cacheKey="ws:b" />));
    expect(container.scrollTop).toBe(0);

    // Back to ws:a — its snapshot still applies.
    container.scrollTop = 0;
    mockRect(row, 160);
    await act(async () => root.render(<Probe cacheKey="ws:a" />));
    expect(container.scrollTop).toBe(100); // 160 - saved offset 60

    await act(async () => root.unmount());
  });

  it("a scroll event while hidden cannot overwrite the saved snapshot", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(<Probe cacheKey="ws:hidden" />));

    const container = host.querySelector<HTMLDivElement>("div")!;
    const row = container.querySelector("div")!;
    mockClientHeight(container, 500);
    mockRect(container, 0, 500);
    mockRect(row, 60);
    container.scrollTop = 40;
    await act(async () => {
      container.dispatchEvent(new Event("scroll"));
    });

    // Collapse layout, then fire a stray scroll event — the record guard
    // must skip it, preserving the good snapshot.
    mockClientHeight(container, 0);
    container.scrollTop = 0;
    await act(async () => {
      container.dispatchEvent(new Event("scroll"));
    });
    expect(readScrollAnchorSnapshot("ws:hidden")?.scrollTop).toBe(40);
    expect(readScrollAnchorSnapshot("ws:hidden")?.key).toBe("row.x");

    await act(async () => root.unmount());
  });

  it("unregisters the container on unmount", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(<Probe cacheKey="ws:gone" />));

    const container = host.querySelector<HTMLDivElement>("div")!;
    mockClientHeight(container, 500);
    mockRect(container, 0, 500);
    expect(captureRegisteredScrollAnchors().size).toBe(1);

    await act(async () => root.unmount());
    expect(captureRegisteredScrollAnchors().size).toBe(0);
  });
});
