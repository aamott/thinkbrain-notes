// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import {
  samePhoneRoute,
  usePhoneNavigation,
  type PhoneHistoryIntegration,
  type PhoneNavigation
} from "./usePhoneNavigation";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const renderNav = async (
  workspace: string | null,
  integration?: PhoneHistoryIntegration
): Promise<() => PhoneNavigation> => {
  const box: { current: PhoneNavigation | null } = { current: null };
  const Probe = ({ ws }: { readonly ws: string | null }) => {
    box.current = usePhoneNavigation(ws, integration);
    return null;
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<Probe ws={workspace} />);
  });
  return () => {
    if (!box.current) throw new Error("hook did not render");
    return box.current;
  };
};

/** The routed depth written into the current history entry. */
const historyDepth = (): number | undefined =>
  (window.history.state as { depth?: number } | null)?.depth;

describe("usePhoneNavigation visit integration", () => {
  it("treats the same tab at a different visit as a different route", () => {
    expect(
      samePhoneRoute({ kind: "tab", tabId: "t", visitId: 1 }, { kind: "tab", tabId: "t", visitId: 2 })
    ).toBe(false);
    expect(
      samePhoneRoute({ kind: "tab", tabId: "t", visitId: 1 }, { kind: "tab", tabId: "t", visitId: 1 })
    ).toBe(true);
    // An unbound route is a wildcard: the same tab at any visit is the same
    // destination, so binding never stacks a duplicate.
    expect(samePhoneRoute({ kind: "tab", tabId: "t" }, { kind: "tab", tabId: "t", visitId: 2 })).toBe(
      true
    );
  });

  it("pushes a distinct entry for a same-tab route at a new visit", async () => {
    const nav = await renderNav("/vault");
    await act(async () => nav().push({ kind: "tab", tabId: "t", visitId: 1 }));
    await act(async () => nav().push({ kind: "tab", tabId: "t", visitId: 2 }));

    expect(historyDepth()).toBe(2);
    expect(nav().route).toEqual({ kind: "tab", tabId: "t", visitId: 2 });
  });

  it("bindVisit rewrites the current tab route in place", async () => {
    const nav = await renderNav("/vault");
    await act(async () => nav().push({ kind: "tab", tabId: "t" }));
    expect(historyDepth()).toBe(1);

    await act(async () => nav().bindVisit(7));

    expect(nav().route).toEqual({ kind: "tab", tabId: "t", visitId: 7 });
    expect(historyDepth()).toBe(1);
    // In place, not pushed: one Back reaches the root.
    await act(async () => nav().back());
    expect(nav().route).toEqual({ kind: "files" });
  });

  it("bindVisit under an inspector still binds the buried entry through the ledger", async () => {
    const nav = await renderNav("/vault");
    await act(async () => nav().push({ kind: "tab", tabId: "t" }));
    await act(async () =>
      nav().pushOverlay({ kind: "inspector", panel: "outline", parent: "content" })
    );
    expect(historyDepth()).toBe(2);

    // The same-batch opener+inspector case: the bare tab push is buried
    // under the sheet, so only the ledger slot can carry the binding — the
    // physical pushState entry underneath was never rewritten.
    await act(async () => nav().bindVisit(3));

    expect(nav().overlay).toEqual({ kind: "inspector", panel: "outline", parent: "content" });
    expect(nav().route).toEqual({ kind: "tab", tabId: "t", visitId: 3 });
    expect(historyDepth()).toBe(2);
    // Back peels the inspector and lands on the tab entry — resolved to its
    // visit through the ledger, not left as a bare route that cannot restore.
    await act(async () => nav().back());
    expect(nav().route).toEqual({ kind: "tab", tabId: "t", visitId: 3 });
    expect(nav().overlay).toBeNull();
  });

  it("a buried bare entry resolves dead when its visit was scrubbed", async () => {
    let live = true;
    const nav = await renderNav("/vault", {
      isVisitLive: () => live
    });
    await act(async () => nav().push({ kind: "tab", tabId: "t" }));
    await act(async () =>
      nav().pushOverlay({ kind: "inspector", panel: "outline", parent: "content" })
    );
    await act(async () => nav().bindVisit(3));

    // Scrub the visit after binding, then pop: the ledger says the buried
    // slot names visit 3, so the pop skips it rather than adopting a bare
    // route that liveness could never vet.
    live = false;
    await act(async () => nav().back());

    expect(nav().route).toEqual({ kind: "files" });
    expect(historyDepth()).toBe(0);
  });

  it("captures the departure location before pushing away from a tab", async () => {
    const captured: number[] = [];
    const nav = await renderNav("/vault", {
      captureDeparture: () => captured.push(1)
    });
    await act(async () => nav().push({ kind: "tab", tabId: "t", visitId: 1 }));
    expect(captured).toHaveLength(0);

    await act(async () => nav().push({ kind: "files" }));
    expect(captured).toHaveLength(1);
  });

  it("captures the departure location on a browser pop off a tab", async () => {
    const captured: number[] = [];
    const nav = await renderNav("/vault", {
      captureDeparture: () => captured.push(1)
    });
    await act(async () => nav().push({ kind: "tab", tabId: "t", visitId: 1 }));

    await act(async () => window.history.back());
    expect(captured).toHaveLength(1);
    expect(nav().route).toEqual({ kind: "files" });
  });

  it("does not capture when leaving a non-tab route", async () => {
    const captured: number[] = [];
    const nav = await renderNav("/vault", {
      captureDeparture: () => captured.push(1)
    });
    await act(async () => nav().push({ kind: "panel", panel: "search" }));

    await act(async () => window.history.back());
    expect(captured).toHaveLength(0);
  });

  it("captures before replacing a tab route for Home", async () => {
    const captured: number[] = [];
    const nav = await renderNav("/vault", {
      captureDeparture: () => captured.push(1)
    });
    await act(async () => nav().push({ kind: "tab", tabId: "t", visitId: 1 }));

    await act(async () => nav().replace({ kind: "files" }));
    expect(captured).toHaveLength(1);
  });

  it("skips a popped entry whose visit died, stepping back to the live root", async () => {
    const nav = await renderNav("/vault", {
      isVisitLive: (visitId) => visitId !== 1
    });
    await act(async () => nav().push({ kind: "tab", tabId: "a", visitId: 1 }));
    await act(async () => nav().push({ kind: "tab", tabId: "b", visitId: 2 }));

    // The pop lands on visit 1's entry, which the core has since scrubbed:
    // keep stepping rather than reopening the dead resource.
    await act(async () => nav().back());

    expect(nav().route).toEqual({ kind: "files" });
    expect(historyDepth()).toBe(0);
    expect(nav().canGoBack).toBe(false);
  });

  it("skips a dead visit in the forward direction", async () => {
    const nav = await renderNav("/vault", {
      isVisitLive: (visitId) => visitId !== 2
    });
    await act(async () => nav().push({ kind: "tab", tabId: "a", visitId: 1 }));
    await act(async () => nav().push({ kind: "tab", tabId: "b", visitId: 2 }));
    await act(async () => nav().push({ kind: "tab", tabId: "c", visitId: 3 }));
    // One Back already lands past dead visit 2: the skip cascades inside the
    // same gesture until a live entry adopts.
    await act(async () => nav().back());
    expect(nav().route).toEqual({ kind: "tab", tabId: "a", visitId: 1 });

    // Forward pops visit 2's entry — scrubbed — so it walks on to visit 3.
    await act(async () => nav().forward());

    expect(nav().route).toEqual({ kind: "tab", tabId: "c", visitId: 3 });
    expect(historyDepth()).toBe(3);
  });

  it("reports Forward as unavailable when only dead visits sit deeper", async () => {
    // Only visit 1 lives — visits 2 and 3 were scrubbed by a close.
    const nav = await renderNav("/vault", {
      isVisitLive: (visitId) => visitId === 1
    });
    await act(async () => nav().push({ kind: "tab", tabId: "a", visitId: 1 }));
    await act(async () => nav().push({ kind: "tab", tabId: "b", visitId: 2 }));
    await act(async () => nav().push({ kind: "tab", tabId: "c", visitId: 3 }));

    // Back skips the dead tail and lands on A.
    await act(async () => nav().back());
    expect(nav().route).toEqual({ kind: "tab", tabId: "a", visitId: 1 });

    // Everything deeper is dead: Forward greys out and does nothing.
    expect(nav().canGoForward).toBe(false);
    await act(async () => nav().forward());
    expect(nav().route).toEqual({ kind: "tab", tabId: "a", visitId: 1 });
    expect(historyDepth()).toBe(1);
  });

  it("a raw pop onto a dead tail bounces back to the live position", async () => {
    const nav = await renderNav("/vault", {
      isVisitLive: () => false
    });
    await act(async () => nav().push({ kind: "tab", tabId: "a", visitId: 1 }));
    await act(async () => nav().back());
    expect(nav().route).toEqual({ kind: "files" });

    // An OS-level forward lands on the dead tip: nothing live deeper, so the
    // pop bounces back to the entry the gesture came from — Home is never
    // rewritten into the dead slot.
    await act(async () => window.history.forward());

    expect(nav().route).toEqual({ kind: "files" });
    expect(historyDepth()).toBe(0);
  });

  it("drops slots beyond the newest ledger window, never targeting pruned depths", async () => {
    // Liveness wired so Back consults the ledger — with no integration the
    // hook steps physical entries blind and the bound only saves memory.
    const nav = await renderNav("/vault", { isVisitLive: () => true });
    for (let i = 1; i <= 205; i += 1) {
      // Each push needs its own committed physical history entry.
      await act(async () => nav().push({ kind: "tab", tabId: `t${i}`, visitId: i }));
    }
    expect(historyDepth()).toBe(205);

    // The newest slot is still retained: one Back answers it immediately.
    await act(async () => nav().back());
    expect(nav().route).toEqual({ kind: "tab", tabId: "t204", visitId: 204 });

    // Walk to the ledger floor: depths 1–5 aged out, so the last Back jumps
    // straight to the always-live root instead of landing on a pruned slot.
    for (let i = 0; i < 199; i += 1) {
      await act(async () => nav().back());
    }
    expect(nav().route).toEqual({ kind: "files" });
    expect(historyDepth()).toBe(0);
  });
});
