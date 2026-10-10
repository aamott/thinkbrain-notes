import { expect, test, type Page } from "@playwright/test";

/** The bag the page-side probe stashes on window between evaluates. */
interface ProbeView {
  readonly state: {
    readonly selection: { readonly main: { readonly head: number } };
    readonly doc: {
      readonly length: number;
      toString: () => string;
      lineAt: (pos: number) => { readonly number: number; readonly text: string };
    };
  };
  dispatch: (spec: unknown) => void;
  lineBlockAtHeight: (height: number) => { readonly from: number };
}

interface ProbeBag {
  readonly React: { createElement: (...args: readonly unknown[]) => unknown };
  readonly EditorView: { findFromDOM: (dom: Element) => ProbeView | null };
  readonly undoDepth: (state: unknown) => number;
  readonly MD: { MarkdownEditor: unknown };
  readonly CE: { CodeEditor: unknown };
  readonly box: HTMLElement;
  readonly root: { render: (node: unknown) => void };
}

declare global {
  interface Window {
    __probe?: ProbeBag;
  }
}

/**
 * Scroll-anchor regressions: the settings document keeps its position across
 * ui.scale reflows and tab remounts, and CodeMirror owns its own scroller so
 * parked scroll state actually restores.
 *
 * Phone-project file (naming convention in playwright.config.ts); desktop
 * scenarios build their own fine-pointer context inside the spec.
 */

const SCROLLER = '[data-testid="settings-content-scroll"]';
const UI_SCALE = 'select[id="ui.scale"]';

async function openSettings(page: Page, phone: boolean): Promise<void> {
  if (phone) {
    await page.getByRole("button", { name: "Main menu" }).tap();
    await page
      .getByRole("dialog", { name: "Navigation" })
      .getByRole("button", { name: "Settings" })
      .tap();
  } else {
    await page.locator('button[aria-label="Settings"]').first().click();
  }
  await expect(page.locator(SCROLLER)).toBeVisible();
}

/** Row offset inside the scroller content + its viewport position. */
const rowMetrics = (page: Page) =>
  page.evaluate(() => {
    const scroller = document.querySelector('[data-testid="settings-content-scroll"]')!;
    const row = document.querySelector('[data-scroll-anchor-key="ui.scale"]')!;
    const sr = scroller.getBoundingClientRect();
    const rr = row.getBoundingClientRect();
    return {
      scrollTop: scroller.scrollTop,
      rowContentY: rr.top - sr.top + scroller.scrollTop,
      // Container-relative: immune to header chrome resizing on scale.
      offsetInScroller: rr.top - sr.top,
      rowViewportY: rr.top,
      visible: rr.bottom > sr.top && rr.top < sr.bottom
    };
  });

async function centerScaleRow(page: Page): Promise<void> {
  await page.evaluate(() => {
    document
      .querySelector('[data-scroll-anchor-key="ui.scale"]')
      ?.scrollIntoView({ block: "center" });
  });
}

test.describe("settings scroll anchor", () => {
  for (const phone of [true, false]) {
    test(`keeps the ui.scale row anchored through scale changes (${phone ? "phone" : "desktop"})`, async ({
      browser
    }) => {
      const context = await browser.newContext(
        phone
          ? { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true }
          : { viewport: { width: 1280, height: 800 } }
      );
      const page = await context.newPage();
      try {
        await page.goto("/");
        await openSettings(page, phone);
        await centerScaleRow(page);
        // Focus the control so its row is the anchor of choice.
        if (phone) await page.locator(UI_SCALE).tap();
        else await page.locator(UI_SCALE).click();
        const baseline = await rowMetrics(page);
        expect(baseline.visible).toBe(true);

        for (const next of ["125", "100"] as const) {
          await page.locator(UI_SCALE).selectOption(next);
          const after = await rowMetrics(page);
          expect(after.visible, `row visible at ${next}%`).toBe(true);
          // The row's scroller-relative offset is preserved (drift moved
          // scrollTop, not the anchor) — generous bound: control heights
          // reflow by up to ~30px.
          expect(Math.abs(after.offsetInScroller - baseline.offsetInScroller)).toBeLessThanOrEqual(60);
        }

        await page.keyboard.press("Control+=");
        const zoomed = await rowMetrics(page);
        expect(zoomed.visible).toBe(true);
        expect(Math.abs(zoomed.offsetInScroller - baseline.offsetInScroller)).toBeLessThanOrEqual(60);
      } finally {
        await context.close();
      }
    });
  }

  test("unfocused scale change anchors the first visible row", async ({ page }) => {
    await page.goto("/");
    await openSettings(page, true);
    await centerScaleRow(page);
    // Nothing focused: the anchor must be the first visible setting row.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const firstVisible = () =>
      page.evaluate(() => {
        const scroller = document.querySelector('[data-testid="settings-content-scroll"]')!;
        const sr = scroller.getBoundingClientRect();
        for (const el of scroller.querySelectorAll<HTMLElement>("[data-scroll-anchor-key]")) {
          const r = el.getBoundingClientRect();
          const key = el.getAttribute("data-scroll-anchor-key")!;
          if (!key.startsWith("section:") && r.bottom > sr.top && r.top < sr.bottom) {
            return { key, offset: r.top - sr.top };
          }
        }
        return null;
      });
    const before = await firstVisible();
    expect(before).not.toBeNull();

    await page.keyboard.press("Control+=");
    const after = await firstVisible();
    expect(after?.key).toBe(before!.key);
    expect(Math.abs(after!.offset - before!.offset)).toBeLessThanOrEqual(60);
  });

  for (const phone of [true, false]) {
    test(`restores the settings scroll anchor across a tab switch (${phone ? "phone" : "desktop"})`, async ({
      browser
    }) => {
      const context = await browser.newContext(
        phone
          ? { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true }
          : { viewport: { width: 1280, height: 800 } }
      );
      const page = await context.newPage();
      try {
        await page.goto("/");
        await openSettings(page, phone);
        await centerScaleRow(page);
        const baseline = await rowMetrics(page);

        if (phone) {
          await page.getByRole("button", { name: /Open tabs/ }).tap();
          await page
            .getByRole("dialog", { name: "Open tabs" })
            .locator('[aria-label="New tab"]')
            .tap();
          await page.getByRole("button", { name: /Open tabs/ }).tap();
          await page
            .getByRole("dialog", { name: "Open tabs" })
            .locator("button", { hasText: "Settings" })
            .first()
            .tap();
        } else {
          await page.locator('button[aria-label="New tab"]').first().click();
          await page.locator('[data-tab-id] button', { hasText: "Settings" }).first().click();
        }
        await expect(page.locator(SCROLLER)).toBeVisible();

        const restored = await rowMetrics(page);
        expect(restored.visible).toBe(true);
        // Same anchor: the row's content position and its viewport offset
        // are both back, so scrollTop lands within layout noise of before.
        expect(Math.abs(restored.scrollTop - baseline.scrollTop)).toBeLessThanOrEqual(8);
        expect(Math.abs(restored.offsetInScroller - baseline.offsetInScroller)).toBeLessThanOrEqual(60);
      } finally {
        await context.close();
      }
    });
  }
});

test.describe("editor scroll ownership", () => {
  /**
   * Mounts the real modules into ONE React root inside an isolated 500px
   * box via Vite imports. `root.render` + `key` on the element reproduces
   * TabBoundary semantics: a new stateKey unmounts/remounts the editor.
   */
  async function probeSetup(page: Page): Promise<void> {
    await page.evaluate(async () => {
      const [mdSrc, mainSrc, cmdSrc] = await Promise.all([
        fetch("/src/tabs/MarkdownEditor.tsx").then((r) => r.text()),
        fetch("/src/main.tsx").then((r) => r.text()),
        fetch("/src/tabs/editorCommands.ts").then((r) => r.text())
      ]);
      const all = mdSrc + cmdSrc + mainSrc;
      const dep = (name: string) =>
        all.match(new RegExp(`/node_modules/\\.vite/deps/${name}\\.js\\?v=[a-z0-9]+`))![0];
      const React = (await import(dep("react"))).default;
      const { createRoot } = (await import(dep("react-dom_client"))).default;
      const { EditorView } = await import(dep("@codemirror_view"));
      const { undoDepth } = await import(dep("@codemirror_commands"));
      const dynImport = (path: string): Promise<Record<string, unknown>> =>
        import(/* @vite-ignore */ path) as Promise<Record<string, unknown>>;
      const MD = (await dynImport("/src/tabs/MarkdownEditor.tsx")) as unknown as ProbeBag["MD"];
      const CE = (await dynImport("/src/tabs/CodeEditor.tsx")) as unknown as ProbeBag["CE"];
      const box = document.createElement("div");
      box.id = "editor-probe-box";
      box.style.cssText =
        "position:fixed;inset:20px;width:520px;height:500px;display:flex;flex-direction:column;z-index:99999";
      document.body.appendChild(box);
      window.__probe = { React, EditorView, undoDepth, MD, CE, box, root: createRoot(box) };
    });
  }

  const mountEditor = (page: Page, kind: "MD" | "CE", props: Record<string, unknown>, value: string) =>
    page.evaluate(
      ([k, p, v]) => {
        const { React, MD, CE, root } = window.__probe!;
        const C = k === "MD" ? MD.MarkdownEditor : CE.CodeEditor;
        // key=stateKey: same replacement semantics as DesktopShell's keyed
        // TabBoundary — switching keys is a real unmount/remount.
        root.render(
          React.createElement(C, {
            ...(p as object),
            key: (p as Record<string, unknown>).stateKey as string,
            value: v,
            onChange: () => {},
            onSave: () => {}
          })
        );
      },
      [kind, props, value]
    );

  /** Waits for exactly one editor showing a doc containing `marker`. */
  const settle = (page: Page, marker: string) =>
    page.waitForFunction(
      (m) => {
        if (document.querySelectorAll("#editor-probe-box .cm-editor").length !== 1) return false;
        const host = document.querySelector("#editor-probe-box section > div");
        // Virtualized rendering: the marker may live off-screen, so read
        // the view's document, not the DOM.
        const view = host ? window.__probe!.EditorView.findFromDOM(host) : null;
        return view?.state.doc.toString().includes(m) ?? false;
      },
      marker
    );

  const metrics = (page: Page) =>
    page.evaluate(() => {
      const scroller = document.querySelector("#editor-probe-box .cm-scroller") as HTMLElement;
      const host = document.querySelector("#editor-probe-box section > div") as HTMLElement;
      const view = window.__probe!.EditorView.findFromDOM(host);
      const firstLine = view
        ? view.state.doc.lineAt(view.lineBlockAtHeight(scroller.scrollTop).from).text
        : null;
      return {
        editors: document.querySelectorAll("#editor-probe-box .cm-editor").length,
        host: {
          scrollTop: host.scrollTop,
          scrollHeight: host.scrollHeight,
          clientHeight: host.clientHeight
        },
        scroller: {
          scrollTop: scroller.scrollTop,
          scrollLeft: scroller.scrollLeft,
          scrollHeight: scroller.scrollHeight,
          clientHeight: scroller.clientHeight
        },
        sel: view?.state.selection.main.head ?? null,
        undo: view ? window.__probe!.undoDepth(view.state) : null,
        firstLine
      };
    });

  test("cm-scroller owns scrolling and A/B/A remount restores snapshot", async ({ page }) => {
    await page.goto("/");
    await probeSetup(page);
    const doc = Array.from({ length: 2000 }, (_, i) => `line ${i + 1} ${"x".repeat(30)}`).join("\n");
    const docB = Array.from({ length: 2000 }, (_, i) => `B line ${i + 1}`).join("\n");
    const props = { isSaving: false, error: null, rootPath: "/vault", relativePath: "a.md", stateKey: "A" };

    await mountEditor(page, "MD", props, doc);
    await settle(page, "line 2000");

    const m0 = await metrics(page);
    expect(m0.editors).toBe(1);
    // CodeMirror's own scroller now holds the overflow; the host clips it.
    expect(m0.scroller.clientHeight).toBeLessThan(m0.scroller.scrollHeight);
    expect(m0.host.scrollHeight).toBeLessThanOrEqual(m0.host.clientHeight + 2);

    await page.evaluate(() => {
      const s = document.querySelector("#editor-probe-box .cm-scroller") as HTMLElement;
      s.scrollTop = 8000;
      const host = document.querySelector("#editor-probe-box section > div") as HTMLElement;
      window.__probe!.EditorView.findFromDOM(host)?.dispatch({ selection: { anchor: 40000 } });
      s.scrollTop = 8000;
    });
    const m1 = await metrics(page);
    expect(m1.host.scrollTop).toBe(0);
    expect(m1.firstLine).toContain("line ");

    // Real keyed remount (stateKey prop drives React key): A → B → A.
    await mountEditor(page, "MD", { ...props, relativePath: "b.md", stateKey: "B" }, docB);
    await settle(page, "B line 2000");
    await mountEditor(page, "MD", props, doc);
    await settle(page, "line 2000");
    // The snapshot's post-layout measure can land a frame later.
    await page.waitForTimeout(400);

    const m2 = await metrics(page);
    expect(m2.editors).toBe(1);
    expect(m2.sel).toBe(40000);
    // Same logical first visible line — the snapshot, not raw pixels.
    // lineBlockAtHeight rounds at line boundaries, so allow a line of drift.
    const lineNo = (t: string | null) => Number(t?.match(/line (\d+)/)?.[1] ?? -1);
    expect(Math.abs(lineNo(m2.firstLine) - lineNo(m1.firstLine))).toBeLessThanOrEqual(2);
    expect(Math.abs(m2.scroller.scrollTop - m1.scroller.scrollTop)).toBeLessThanOrEqual(150);
  });

  test("code editor restores vertical scroll and undo history", async ({ page }) => {
    await page.goto("/");
    await probeSetup(page);
    const code = Array.from({ length: 2000 }, (_, i) => `const line${i} = "${"y".repeat(400)}";`).join("\n");
    const codeD = Array.from({ length: 2000 }, (_, i) => `const other${i} = "${"z".repeat(400)}";`).join("\n");
    const props = { isSaving: false, error: null, rootPath: "/vault", relativePath: "c.ts", stateKey: "C" };

    await mountEditor(page, "CE", props, code);
    await settle(page, "line1999");
    await page.evaluate(() => {
      const s = document.querySelector("#editor-probe-box .cm-scroller") as HTMLElement;
      s.scrollTop = 8000;
      const host = document.querySelector("#editor-probe-box section > div") as HTMLElement;
      // An undoable edit so history must survive the state round-trip.
      window.__probe!.EditorView.findFromDOM(host)?.dispatch({
        changes: { from: 0, insert: "// probe\n" }
      });
    });
    const before = await metrics(page);
    // CodeMirror can settle a few px while measuring after the programmatic
    // scroll; assert the neighborhood, not the exact assignment.
    expect(Math.abs(before.scroller.scrollTop - 8000)).toBeLessThanOrEqual(200);
    expect(before.undo).toBeGreaterThan(0);
    // CodeEditor mounts `EditorView.lineWrapping` unconditionally, so there
    // is no horizontal overflow — scrollLeft clamps to 0 and horizontal
    // snapshot restore is not empirically covered here (vertical only).
    expect(before.scroller.scrollLeft).toBe(0);

    await mountEditor(page, "CE", { ...props, relativePath: "d.ts", stateKey: "D" }, codeD);
    await settle(page, "other1999");
    await mountEditor(page, "CE", props, code);
    await settle(page, "line1999");
    // Language support loads async and reconfigures the view; give the
    // snapshot's post-layout settle room before measuring.
    await page.waitForTimeout(900);

    const after = await metrics(page);
    expect(after.editors).toBe(1);
    expect(after.undo).toBeGreaterThan(0);
    const codeLineNo = (t: string | null) => Number(t?.match(/line(\d+)/)?.[1] ?? -1);
    expect(Math.abs(codeLineNo(after.firstLine) - codeLineNo(before.firstLine))).toBeLessThanOrEqual(2);
    expect(Math.abs(after.scroller.scrollTop - before.scroller.scrollTop)).toBeLessThanOrEqual(150);
  });

  test("a near-end position stays near the end after remount", async ({ page }) => {
    await page.goto("/");
    await probeSetup(page);
    const doc = Array.from({ length: 2000 }, (_, i) => `tail ${i + 1}`).join("\n");
    const props = { isSaving: false, error: null, rootPath: "/vault", relativePath: "t.md", stateKey: "T" };

    await mountEditor(page, "MD", props, doc);
    await settle(page, "tail 2000");
    await page.evaluate(() => {
      const s = document.querySelector("#editor-probe-box .cm-scroller") as HTMLElement;
      s.scrollTop = s.scrollHeight;
    });
    const deep = await metrics(page);
    expect(deep.scroller.scrollTop).toBeGreaterThan(30000);
    expect(deep.firstLine).toContain("tail ");

    await mountEditor(page, "MD", { ...props, relativePath: "u.md", stateKey: "U" }, "short\n");
    await settle(page, "short");
    await mountEditor(page, "MD", props, doc);
    await settle(page, "tail 2000");
    await page.waitForTimeout(400);

    const back = await metrics(page);
    const tailNo = (t: string | null) => Number(t?.match(/tail (\d+)/)?.[1] ?? -1);
    expect(Math.abs(tailNo(back.firstLine) - tailNo(deep.firstLine))).toBeLessThanOrEqual(2);
    expect(back.scroller.scrollTop).toBeGreaterThan(deep.scroller.scrollTop - 300);
  });

  test("remount after a width reflow keeps the logical first visible line", async ({ page }) => {
    await page.goto("/");
    await probeSetup(page);
    // Long soft-wrapped lines: narrowing the box reflows every pixel offset.
    const doc = Array.from({ length: 500 }, (_, i) => `wrap ${i + 1} ${"w".repeat(200)}`).join("\n");
    const props = { isSaving: false, error: null, rootPath: "/vault", relativePath: "w.md", stateKey: "W" };

    await mountEditor(page, "MD", props, doc);
    await settle(page, "wrap 500");
    await page.evaluate(() => {
      (document.querySelector("#editor-probe-box .cm-scroller") as HTMLElement).scrollTop = 9000;
    });
    const before = await metrics(page);
    expect(before.firstLine).toContain("wrap ");

    // While the W instance is unmounted, reflow the container narrower.
    await mountEditor(page, "MD", { ...props, relativePath: "x.md", stateKey: "X" }, "tmp\n");
    await settle(page, "tmp");
    await page.evaluate(() => {
      (document.getElementById("editor-probe-box") as HTMLElement).style.width = "320px";
    });
    await mountEditor(page, "MD", props, doc);
    await settle(page, "wrap 500");
    await page.waitForTimeout(400);

    const after = await metrics(page);
    // The snapshot tracks a position, not a pixel: the same logical line
    // must be first-visible even though its pixel offset reflowed.
    const wrapNo = (t: string | null) => Number(t?.match(/wrap (\d+)/)?.[1] ?? -1);
    expect(Math.abs(wrapNo(after.firstLine) - wrapNo(before.firstLine))).toBeLessThanOrEqual(2);
    expect(after.scroller.scrollTop).not.toBe(before.scroller.scrollTop);
  });
});
