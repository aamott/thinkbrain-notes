import { expect, test, type CDPSession, type Page } from "@playwright/test";

/**
 * Note-scoped pinch: two fingers over an editor preview `editor.fontSize`
 * live and commit one rounded value at lift — chrome and the anchored
 * character stay put. Touch events go through CDP `Input.dispatchTouchEvent`
 * (trusted input, not synthetic `dispatchEvent`).
 *
 * The probe mounts the real MarkdownEditor/CodeEditor modules in one React
 * root keyed by `stateKey` like TabBoundary, inside a box that fits the
 * 412px phone viewport so no finger lands off-screen. The production
 * gesture lock — overflow hidden + preventDefault/stopPropagation on owned
 * events — is exercised as-shipped; the test patches only the real
 * `useSettingsStore` module instance (resolved through the transformed
 * MarkdownEditor → useCodeMirrorView import chain) to count commits.
 */

interface FoundView {
  state: {
    doc: { toString: () => string; length: number; lineAt: (p: number) => { text: string } };
    selection: { main: { head: number } };
  };
  dispatch: (spec: unknown) => void;
  posAtCoords: (coords: { x: number; y: number }, precise?: boolean) => number | null;
  coordsAtPos: (pos: number) => { left: number; top: number } | null;
  lineBlockAt: (pos: number) => { top: number };
  lineBlockAtHeight: (h: number) => { from: number };
  documentTop: number;
  scrollDOM: HTMLElement;
  contentDOM: HTMLElement;
  dom: HTMLElement;
}

interface StoreState {
  setSingleSettingImmediately: (k: string, v: unknown) => Promise<void>;
  stageChange: (k: string, v: unknown) => void;
}

interface ProbeBag {
  readonly React: { createElement: (...args: readonly unknown[]) => unknown };
  readonly EditorView: { findFromDOM: (dom: Element) => FoundView | null };
  readonly MD: { MarkdownEditor: unknown };
  readonly CE: { CodeEditor: unknown };
  readonly box: HTMLElement;
  readonly root: { render: (node: unknown) => void };
  /** Resolved module URL of the REAL settings-store instance. */
  readonly storeUrl: string;
  commitCalls: { key: string; value: unknown }[];
}

declare global {
  interface Window {
    __pinch?: ProbeBag;
  }
}

const SETTING_KEY = "editor.fontSize";

async function probeSetup(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const fetchSrc = (url: string): Promise<string> =>
      fetch(url).then((r) => r.text());
    const [mdSrc, mainSrc] = await Promise.all([
      fetchSrc("/src/tabs/MarkdownEditor.tsx"),
      fetchSrc("/src/main.tsx")
    ]);
    const all = mdSrc + mainSrc;
    const dep = (name: string) =>
      all.match(new RegExp(`/node_modules/\\.vite/deps/${name}\\.js\\?v=[a-z0-9]+`))![0];
    const React = (await import(dep("react"))).default;
    const { createRoot } = (await import(dep("react-dom_client"))).default;
    const { EditorView } = await import(dep("@codemirror_view"));
    const dynImport = (path: string): Promise<Record<string, unknown>> =>
      import(/* @vite-ignore */ path) as Promise<Record<string, unknown>>;
    const MD = (await dynImport("/src/tabs/MarkdownEditor.tsx")) as unknown as ProbeBag["MD"];
    const CE = (await dynImport("/src/tabs/CodeEditor.tsx")) as unknown as ProbeBag["CE"];

    // Resolve the store through the REAL import chain: the specifier Vite
    // serves inside the transformed MarkdownEditor → useCodeMirrorView
    // module is the exact instance the mounted editor uses — no guessing a
    // sibling module URL.
    const resolve = (spec: string, base: string): string => {
      const u = new URL(spec, location.origin + base);
      return u.pathname + u.search;
    };
    const cmvSpec = mdSrc.match(/from\s*["']([^"']*useCodeMirrorView[^"']*)["']/)![1]!;
    const cmvUrl = resolve(cmvSpec, "/src/tabs/MarkdownEditor.tsx");
    const cmvSrc = await fetchSrc(cmvUrl);
    const storeSpec = cmvSrc.match(/from\s*["']([^"']*settingsStore[^"']*)["']/)![1]!;
    const storeUrl = resolve(storeSpec, cmvUrl);
    const storeMod = (await dynImport(storeUrl)) as {
      useSettingsStore: { getState: () => StoreState };
    };
    const commitCalls: ProbeBag["commitCalls"] = [];
    const state = storeMod.useSettingsStore.getState();
    const origSetSingle = state.setSingleSettingImmediately.bind(state);
    // Count through the real path: stage + persist attempt stay intact
    // (persist fails in a browser with no Tauri bridge — that error is
    // expected and unrelated to this counter).
    state.setSingleSettingImmediately = async (k: string, v: unknown) => {
      commitCalls.push({ key: k, value: v });
      return origSetSingle(k, v);
    };

    // Width must fit the 412px phone viewport — an over-wide probe puts
    // pinch fingers off-screen.
    const box = document.createElement("div");
    box.id = "pinch-probe-box";
    box.style.cssText =
      "position:fixed;left:6px;right:6px;top:6px;height:520px;display:flex;flex-direction:column;z-index:99999;background:Canvas";
    document.body.appendChild(box);
    window.__pinch = { React, EditorView, MD, CE, box, root: createRoot(box), storeUrl, commitCalls };
  });
}

const mountEditor = (
  page: Page,
  kind: "MD" | "CE",
  props: Record<string, unknown>,
  value: string
) =>
  page.evaluate(
    ({ k, p, v }: { k: "MD" | "CE"; p: Record<string, unknown>; v: string }) => {
      const { React, MD, CE, root } = window.__pinch!;
      const C = k === "MD" ? MD.MarkdownEditor : CE.CodeEditor;
      root.render(
        React.createElement(C, {
          ...(p as object),
          key: p.stateKey as string,
          value: v,
          onChange: () => {},
          onSave: () => {}
        })
      );
    },
    { k: kind, p: props, v: value }
  );

const unmount = (page: Page) =>
  page.evaluate(() => {
    window.__pinch!.root.render(null);
  });

const settle = (page: Page, marker: string) =>
  page.waitForFunction((m) => {
    if (document.querySelectorAll("#pinch-probe-box .cm-editor").length !== 1) return false;
    const host = document.querySelector("#pinch-probe-box section > div");
    const view = host ? window.__pinch!.EditorView.findFromDOM(host) : null;
    return view?.state.doc.toString().includes(m) ?? false;
  }, marker);

interface EditorMetrics {
  fontSize: number;
  scrollTop: number;
  scrollLeft: number;
  transform: string;
  overflow: string;
  selectionHead: number | null;
  touchAction: string;
  rootFontSize: string;
  vvScale: number;
  docLength: number;
}

const metrics = (page: Page): Promise<EditorMetrics> =>
  page.evaluate(() => {
    const scroller = document.querySelector("#pinch-probe-box .cm-scroller") as HTMLElement;
    const host = document.querySelector("#pinch-probe-box section > div") as HTMLElement;
    const view = window.__pinch!.EditorView.findFromDOM(host);
    return {
      fontSize: parseFloat(getComputedStyle(scroller).fontSize),
      scrollTop: scroller.scrollTop,
      scrollLeft: scroller.scrollLeft,
      transform: view?.dom.style.transform ?? "",
      overflow: scroller.style.overflow,
      selectionHead: view?.state.selection.main.head ?? null,
      touchAction: scroller.style.touchAction,
      rootFontSize: getComputedStyle(document.documentElement).fontSize,
      vvScale: window.visualViewport?.scale ?? 1,
      docLength: view?.state.doc.length ?? -1
    };
  });

const commitCalls = (page: Page): Promise<{ key: string; value: unknown }[]> =>
  page.evaluate(() => [...window.__pinch!.commitCalls]);

/** Scroll the live view to `top` and let CodeMirror settle its measure. */
async function scrollTo(page: Page, top: number): Promise<void> {
  await page.evaluate((t) => {
    const scroller = document.querySelector("#pinch-probe-box .cm-scroller") as HTMLElement;
    scroller.scrollTop = t;
  }, top);
  await page.waitForTimeout(350);
}

/**
 * The character under the gesture midpoint: resolved before the pinch so
 * post-commit assertions can verify it stayed under the fingers.
 */
async function captureAnchor(
  page: Page,
  x: number,
  y: number
): Promise<{ pos: number; offsetX: number; offsetY: number }> {
  return page.evaluate(
    ({ x, y }) => {
      const host = document.querySelector("#pinch-probe-box section > div") as HTMLElement;
      const view = window.__pinch!.EditorView.findFromDOM(host)!;
      const pos = view.posAtCoords({ x, y }, false)!;
      const rect = view.coordsAtPos(pos)!;
      return { pos, offsetX: rect.left - x, offsetY: rect.top - y };
    },
    { x, y }
  );
}

/**
 * Where the anchored character ended up after the commit reflow. Requires
 * REAL coordinates — polling until `coordsAtPos` returns non-null; a
 * line-block estimate would just re-assert the same guesswork the commit
 * is supposed to correct.
 */
async function anchoredRect(page: Page, pos: number) {
  const handle = await page.waitForFunction(
    (p) => {
      const host = document.querySelector("#pinch-probe-box section > div") as HTMLElement;
      const view = window.__pinch!.EditorView.findFromDOM(host);
      const rect = view?.coordsAtPos(p) ?? null;
      return rect ? { left: rect.left, top: rect.top } : false;
    },
    pos,
    { polling: 100, timeout: 5_000 }
  );
  return (await handle.jsonValue()) as { left: number; top: number };
}

interface PinchOpts {
  cx: number;
  cy: number;
  startSpan: number;
  endSpan: number;
  axis?: "x" | "y";
  /** Total midpoint drift across the moves (translating pinch). */
  dx?: number;
  dy?: number;
  steps?: number;
}

type TouchPt = { x: number; y: number; id: number };

const pinchPts = (o: PinchOpts, s: number, dx = 0, dy = 0): [TouchPt, TouchPt] =>
  o.axis === "x"
    ? [
        { x: o.cx + dx - s / 2, y: o.cy + dy, id: 1 },
        { x: o.cx + dx + s / 2, y: o.cy + dy, id: 2 }
      ]
    : [
        { x: o.cx + dx, y: o.cy + dy - s / 2, id: 1 },
        { x: o.cx + dx, y: o.cy + dy + s / 2, id: 2 }
      ];

/** Lands both fingers and drives the span out — leaves them down. */
async function pinchMoves(page: Page, cdp: CDPSession, opts: PinchOpts): Promise<void> {
  const { startSpan, endSpan, steps = 4 } = opts;
  // Fingers land sequentially, as a real hand places them.
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [pinchPts(opts, startSpan)[0]]
  });
  await page.waitForTimeout(30);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: pinchPts(opts, startSpan)
  });
  await page.waitForTimeout(30);
  for (let i = 1; i <= steps; i++) {
    const s = startSpan + ((endSpan - startSpan) * i) / steps;
    const dx = ((opts.dx ?? 0) * i) / steps;
    const dy = ((opts.dy ?? 0) * i) / steps;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: pinchPts(opts, s, dx, dy)
    });
    await page.waitForTimeout(50); // let the RAF preview flush between moves
  }
}

/** First finger lifts (gesture ends/commits), the second drains out after. */
async function pinchEnd(page: Page, cdp: CDPSession, opts: PinchOpts): Promise<void> {
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [pinchPts(opts, opts.endSpan, opts.dx ?? 0, opts.dy ?? 0)[0]]
  });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

/** A complete CDP pinch: moves plus a normal two-stage lift. */
async function pinch(page: Page, cdp: CDPSession, opts: PinchOpts): Promise<void> {
  await pinchMoves(page, cdp, opts);
  await pinchEnd(page, cdp, opts);
}

/** Point at the vertical middle of the probe scroller. */
async function scrollerMid(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => {
    const r = (document.querySelector("#pinch-probe-box .cm-scroller") as HTMLElement)
      .getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
}

const DOC = Array.from(
  { length: 2000 },
  (_, i) => `line ${i + 1} ${"x".repeat(30)}`
).join("\n");
const PROPS = {
  isSaving: false,
  error: null,
  rootPath: "/vault",
  relativePath: "a.md",
  stateKey: "P"
};

test.describe("note pinch font zoom", () => {
  test("mid-document vertical spread previews, commits once, keeps the char anchor", async ({
    page,
    context
  }) => {
    await page.goto("/");
    await probeSetup(page);
    const cdp = await context.newCDPSession(page);
    await mountEditor(page, "MD", PROPS, DOC);
    await settle(page, "line 2000");
    // Mid-document: the gesture must own the two-finger pan itself.
    await scrollTo(page, 12000);
    const before = await metrics(page);
    expect(before.fontSize).toBe(16);
    expect(before.touchAction).toBe("pan-x pan-y");
    expect(before.overflow).toBe("");
    const mid = await scrollerMid(page);
    const anchor = await captureAnchor(page, mid.x, mid.y);
    await page.screenshot({ path: "/tmp/pinch-work/spread-mid-before.png" });

    // Gesture moves run — no commit may fire before the lift.
    const opts = { cx: mid.x, cy: mid.y, startSpan: 100, endSpan: 160 };
    await pinchMoves(page, cdp, opts);
    await page.waitForTimeout(150);
    expect(await commitCalls(page)).toEqual([]);
    await pinchEnd(page, cdp, opts);
    await page.waitForTimeout(400);

    const after = await metrics(page);
    // 1.6× of 16 → round(25.6) = 26px real reflow.
    expect(after.fontSize).toBe(26);
    const calls = await commitCalls(page);
    expect(calls.length).toBe(1);
    expect(calls[0]).toEqual({ key: SETTING_KEY, value: 26 });
    // Preview transform cleaned; scroll lock released; chrome untouched.
    expect(after.transform).toBe("");
    expect(after.overflow).toBe("");
    expect(after.rootFontSize).toBe(before.rootFontSize);
    expect(after.vvScale).toBe(1);
    expect(after.selectionHead).toBe(before.selectionHead);
    expect(after.docLength).toBe(before.docLength);
    // The anchored character re-landed under the final midpoint.
    const rect = await anchoredRect(page, anchor.pos);
    expect(rect).not.toBeNull();
    expect(Math.abs(rect!.top - (mid.y + anchor.offsetY))).toBeLessThanOrEqual(26 + 5);
    await page.screenshot({ path: "/tmp/pinch-work/spread-mid-after.png" });
  });

  test("rich markup: selection, staged draft, doc text, and chrome survive", async ({
    page,
    context
  }) => {
    await page.goto("/");
    await probeSetup(page);
    const cdp = await context.newCDPSession(page);
    const RICH = [
      "# Title\n\nIntro paragraph with **bold** and `inline code`.\n\n",
      "## Section\n\n```ts\nconst a = 1;\nconst b = 2;\n```\n\n",
      Array.from(
        { length: 1200 },
        (_, i) => `para ${i + 1} with *italic* and [link](x)`
      ).join("\n")
    ].join("");
    await mountEditor(page, "MD", { ...PROPS, stateKey: "RICH" }, RICH);
    await settle(page, "para 1200");
    // An unrelated staged draft must survive the single-key commit.
    await page.evaluate(async () => {
      const mod = (await import(/* @vite-ignore */ window.__pinch!.storeUrl)) as {
        useSettingsStore: {
          getState: () => { stageChange: (k: string, v: unknown) => void };
        };
      };
      mod.useSettingsStore.getState().stageChange("editor.lineWrapping", true);
    });
    // Nonzero selection inside a fenced code block area.
    const sel = await page.evaluate(() => {
      const host = document.querySelector("#pinch-probe-box section > div") as HTMLElement;
      const view = window.__pinch!.EditorView.findFromDOM(host)!;
      const pos = view.state.doc.toString().indexOf("const b = 2;");
      view.dispatch({ selection: { anchor: pos } });
      return pos;
    });
    await scrollTo(page, 9000);
    const before = await metrics(page);
    const docBefore = await page.evaluate(() => {
      const host = document.querySelector("#pinch-probe-box section > div") as HTMLElement;
      return window.__pinch!.EditorView.findFromDOM(host)!.state.doc.toString();
    });
    // Editor chrome (header slot above the CM view) must not move.
    const chromeBefore = await page.evaluate(
      () =>
        (document.querySelector("#pinch-probe-box .cm-editor") as HTMLElement).offsetTop
    );
    const mid = await scrollerMid(page);
    const anchor = await captureAnchor(page, mid.x, mid.y);

    const opts = { cx: mid.x, cy: mid.y, startSpan: 100, endSpan: 150 };
    await pinchMoves(page, cdp, opts);
    expect(await commitCalls(page)).toEqual([]);
    await pinchEnd(page, cdp, opts);
    await page.waitForTimeout(500);

    const after = await metrics(page);
    expect(after.fontSize).toBe(24); // round(16 * 1.5)
    const calls = await commitCalls(page);
    expect(calls).toEqual([{ key: SETTING_KEY, value: 24 }]);
    expect(after.rootFontSize).toBe(before.rootFontSize);
    expect(after.vvScale).toBe(1);
    // Doc text is byte-identical; selection and chrome untouched.
    const docAfter = await page.evaluate(() => {
      const host = document.querySelector("#pinch-probe-box section > div") as HTMLElement;
      return window.__pinch!.EditorView.findFromDOM(host)!.state.doc.toString();
    });
    expect(docAfter).toBe(docBefore);
    expect(after.selectionHead).toBe(sel);
    expect(
      await page.evaluate(
        () =>
          (document.querySelector("#pinch-probe-box .cm-editor") as HTMLElement).offsetTop
      )
    ).toBe(chromeBefore);
    // The unrelated staged draft is still staged — nothing else was flushed.
    const staged = await page.evaluate(async () => {
      const mod = (await import(/* @vite-ignore */ window.__pinch!.storeUrl)) as {
        useSettingsStore: {
          getState: () => { stagedChanges: Record<string, unknown> };
        };
      };
      return mod.useSettingsStore.getState().stagedChanges;
    });
    expect(staged["editor.lineWrapping"]).toBe(true);
    const rect = await anchoredRect(page, anchor.pos);
    expect(Math.abs(rect.top - (mid.y + anchor.offsetY))).toBeLessThanOrEqual(24 + 5);
    await page.screenshot({ path: "/tmp/pinch-work/rich-after.png" });
  });

  test("mid-document vertical contract commits the smaller size", async ({ page, context }) => {
    await page.goto("/");
    await probeSetup(page);
    const cdp = await context.newCDPSession(page);
    await mountEditor(page, "MD", { ...PROPS, stateKey: "Q" }, DOC);
    await settle(page, "line 2000");
    await scrollTo(page, 8000);
    const mid = await scrollerMid(page);
    const anchor = await captureAnchor(page, mid.x, mid.y);

    await pinch(page, cdp, { cx: mid.x, cy: mid.y, startSpan: 100, endSpan: 40 });
    await page.waitForTimeout(400);
    const after = await metrics(page);
    // 0.4× of 16 = 6.4 → clamps at the 10px floor.
    expect(after.fontSize).toBe(10);
    expect((await commitCalls(page)).length).toBe(1);
    const rect = await anchoredRect(page, anchor.pos);
    expect(rect).not.toBeNull();
    // Near the top of the smaller text the drift may exceed one line at
    // 10px; two lines is still anchored.
    expect(Math.abs(rect!.top - (mid.y + anchor.offsetY))).toBeLessThanOrEqual(2 * 10 + 5);
  });

  test("horizontal pinch translates the midpoint and still anchors", async ({ page, context }) => {
    await page.goto("/");
    await probeSetup(page);
    const cdp = await context.newCDPSession(page);
    await mountEditor(page, "MD", { ...PROPS, stateKey: "R" }, DOC);
    await settle(page, "line 2000");
    await scrollTo(page, 6000);
    const mid = await scrollerMid(page);
    const anchor = await captureAnchor(page, mid.x, mid.y);

    // The midpoint drifts +40x/+30y across the gesture — the commit must
    // land the char under the FINAL midpoint, not the start one.
    await pinch(page, cdp, {
      cx: mid.x,
      cy: mid.y,
      startSpan: 80,
      endSpan: 150,
      axis: "x",
      dx: 40,
      dy: 30
    });
    await page.waitForTimeout(400);
    const after = await metrics(page);
    expect(after.fontSize).toBe(30); // round(16 * 1.875)
    expect((await commitCalls(page)).length).toBe(1);
    const rect = await anchoredRect(page, anchor.pos);
    expect(Math.abs(rect.top - (mid.y + 30 + anchor.offsetY))).toBeLessThanOrEqual(30 + 5);
    // Horizontal anchoring is best-effort: wrapped editors can't scroll
    // left, so assert the char stayed on screen near the drifted x.
    expect(Math.abs(rect.left - (mid.x + 40 + anchor.offsetX))).toBeLessThanOrEqual(80);
  });

  test("a third finger cancels: zero writes, baseline restored", async ({ page, context }) => {
    await page.goto("/");
    await probeSetup(page);
    const cdp = await context.newCDPSession(page);
    await mountEditor(page, "MD", { ...PROPS, stateKey: "T3" }, DOC);
    await settle(page, "line 2000");
    const before = await metrics(page);
    const mid = await scrollerMid(page);
    const pts = (s: number): [TouchPt, TouchPt] => [
      { x: mid.x, y: mid.y - s / 2, id: 1 },
      { x: mid.x, y: mid.y + s / 2, id: 2 }
    ];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [pts(100)[0]] });
    await page.waitForTimeout(30);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(100) });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(160) });
    await page.waitForTimeout(80);
    // A third finger joins → cancel + drain everything.
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [...pts(160), { x: mid.x - 60, y: mid.y, id: 3 }]
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [pts(160)[0], { x: mid.x - 60, y: mid.y, id: 3 }]
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [{ x: mid.x - 60, y: mid.y, id: 3 }]
    });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(300);

    const after = await metrics(page);
    expect((await commitCalls(page))).toEqual([]);
    expect(after.fontSize).toBe(before.fontSize);
    expect(after.transform).toBe("");
    expect(after.overflow).toBe("");
  });

  test("touchcancel previews then restores without writing", async ({ page, context }) => {
    await page.goto("/");
    await probeSetup(page);
    const cdp = await context.newCDPSession(page);
    await mountEditor(page, "MD", { ...PROPS, stateKey: "Q2" }, DOC);
    await settle(page, "line 2000");
    const before = await metrics(page);
    const mid = await scrollerMid(page);

    await pinchMoves(page, cdp, { cx: mid.x, cy: mid.y, startSpan: 100, endSpan: 200 });
    // touchcancel voids the whole sequence — it carries no points.
    await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    await page.waitForTimeout(300);

    const after = await metrics(page);
    expect(after.fontSize).toBe(before.fontSize);
    expect(after.transform).toBe("");
    expect((await commitCalls(page))).toEqual([]);
  });

  test("a no-op ending clears the preview and writes nothing", async ({ page, context }) => {
    await page.goto("/");
    await probeSetup(page);
    const cdp = await context.newCDPSession(page);
    await mountEditor(page, "MD", { ...PROPS, stateKey: "NO" }, DOC);
    await settle(page, "line 2000");
    const before = await metrics(page);
    const mid = await scrollerMid(page);

    // Spread then return: the rounded value lands back on 16.
    await pinch(page, cdp, { cx: mid.x, cy: mid.y, startSpan: 100, endSpan: 102 });
    await page.waitForTimeout(300);
    const after = await metrics(page);
    expect(after.fontSize).toBe(before.fontSize);
    expect(after.transform).toBe("");
    expect(after.overflow).toBe("");
    expect((await commitCalls(page))).toEqual([]);
  });

  test("unmount mid-gesture cancels: zero writes, no crash", async ({ page, context }) => {
    await page.goto("/");
    await probeSetup(page);
    const cdp = await context.newCDPSession(page);
    await mountEditor(page, "MD", { ...PROPS, stateKey: "UM" }, DOC);
    await settle(page, "line 2000");
    const mid = await scrollerMid(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: mid.x, y: mid.y - 50, id: 1 }]
    });
    await page.waitForTimeout(30);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: mid.x, y: mid.y - 50, id: 1 },
        { x: mid.x, y: mid.y + 50, id: 2 }
      ]
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: mid.x, y: mid.y - 80, id: 1 },
        { x: mid.x, y: mid.y + 80, id: 2 }
      ]
    });
    await page.waitForTimeout(80);
    // The tab hides — the view is destroyed under the live gesture.
    await unmount(page);
    await page.waitForTimeout(50);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(300);
    expect((await commitCalls(page))).toEqual([]);
  });

  test("single-finger drag still scrolls after a pinch", async ({ page, context }) => {
    await page.goto("/");
    await probeSetup(page);
    const cdp = await context.newCDPSession(page);
    await mountEditor(page, "MD", { ...PROPS, stateKey: "SF" }, DOC);
    await settle(page, "line 2000");
    const mid = await scrollerMid(page);
    await pinch(page, cdp, { cx: mid.x, cy: mid.y, startSpan: 100, endSpan: 140 });
    await page.waitForTimeout(300);
    expect((await commitCalls(page)).length).toBe(1);

    // A fresh one-finger drag is ordinary scrolling — the lock is released.
    const topBefore = (await metrics(page)).scrollTop;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: mid.x, y: mid.y + 150, id: 1 }]
    });
    for (let i = 1; i <= 4; i++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: mid.x, y: mid.y + 150 - i * 60, id: 1 }]
      });
      await page.waitForTimeout(30);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(200);
    expect((await metrics(page)).scrollTop).toBeGreaterThan(topBefore + 50);

    // A fresh tap immediately after a pinch is a new sequence — its click
    // must fire exactly once, not be eaten by leftover suppression.
    await page.evaluate(() => {
      (window.__pinch as ProbeBag & { clicks?: number }).clicks = 0;
      document
        .querySelector("#pinch-probe-box .cm-scroller")!
        .addEventListener("click", () => {
          (window.__pinch as ProbeBag & { clicks: number }).clicks++;
        });
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: mid.x, y: mid.y, id: 9 }]
    });
    await page.waitForTimeout(40);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(400);
    expect(
      await page.evaluate(() => (window.__pinch as ProbeBag & { clicks: number }).clicks)
    ).toBe(1);
  });

  test("CodeEditor unwrapped keeps horizontal overflow through a font change", async ({
    page
  }) => {
    await page.goto("/");
    await probeSetup(page);
    // Stage lineWrapping=false through the resolved REAL store instance.
    await page.evaluate(async () => {
      const mod = (await import(/* @vite-ignore */ window.__pinch!.storeUrl)) as {
        useSettingsStore: { getState: () => { stageChange: (k: string, v: unknown) => void } };
      };
      mod.useSettingsStore.getState().stageChange("editor.lineWrapping", false);
    });
    const code = Array.from(
      { length: 300 },
      (_, i) => `const line${i} = "${"y".repeat(300)}";`
    ).join("\n");
    await mountEditor(page, "CE", { ...PROPS, relativePath: "c.ts", stateKey: "CE1" }, code);
    await settle(page, "line299");
    // Unwrapped long lines produce real horizontal overflow.
    const overflowBefore = await page.evaluate(() => {
      const scroller = document.querySelector("#pinch-probe-box .cm-scroller") as HTMLElement;
      scroller.scrollLeft = 300;
      return { scrollWidth: scroller.scrollWidth, clientWidth: scroller.clientWidth };
    });
    expect(overflowBefore.scrollWidth).toBeGreaterThan(overflowBefore.clientWidth);
    const before = await metrics(page);
    expect(before.scrollLeft).toBe(300);

    // Preference 16 → 24 reconfigures the same view; scroll survives.
    await page.evaluate(async () => {
      const mod = (await import(/* @vite-ignore */ window.__pinch!.storeUrl)) as {
        useSettingsStore: { getState: () => { stageChange: (k: string, v: unknown) => void } };
      };
      mod.useSettingsStore.getState().stageChange("editor.fontSize", 24);
    });
    await page.waitForTimeout(300);
    const after = await metrics(page);
    expect(after.fontSize).toBe(24);
    expect(after.scrollLeft).toBe(before.scrollLeft);
    // Same view identity is implied by retained scroll position across the
    // reconfigure; doc untouched.
    expect(after.docLength).toBe(before.docLength);
  });

  test("a pinch outside the editor leaves the editor alone", async ({ page, context }) => {
    await page.goto("/");
    await probeSetup(page);
    const cdp = await context.newCDPSession(page);
    await mountEditor(page, "MD", { ...PROPS, stateKey: "OUT" }, DOC);
    await settle(page, "line 2000");
    const before = await metrics(page);
    // A two-finger gesture landing below the probe box is not ours.
    const out = { x: 200, y: 880 };
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: out.x, y: out.y - 50, id: 1 }]
    });
    await page.waitForTimeout(30);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: out.x, y: out.y - 50, id: 1 },
        { x: out.x, y: out.y + 50, id: 2 }
      ]
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: out.x, y: out.y - 90, id: 1 },
        { x: out.x, y: out.y + 90, id: 2 }
      ]
    });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(200);
    const after = await metrics(page);
    expect((await commitCalls(page))).toEqual([]);
    expect(after.fontSize).toBe(before.fontSize);
    // Nothing global is disarmed: the same gesture outside the editor
    // genuinely pinch-zooms the page — platform zoom stays available.
    expect(after.vvScale).toBeGreaterThan(1);
  });
});
