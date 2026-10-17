import { expect, test, type Page } from "@playwright/test";

import { expectNoNativeFailures, installHistoryVault, settledEditorSpot } from "./locationHistoryHarness";

/**
 * Editable-link interaction regressions — desktop chrome.
 *
 * The contract under test: a *concealed* live-preview link is a navigation
 * surface — a plain click follows it and never plants a caret first — while
 * an already-revealed link is raw source and a plain click edits it.
 * Selection gestures (drag, Shift/Alt, secondary buttons) never navigate;
 * Mod+click and Mod-Enter follow explicitly either way.
 *
 * Assertions read the real editor DOM (`.cm-line`, DOM Selection) and the
 * opened document, never the extension's internal gesture state.
 *
 * Desktop-project spec (filename convention in `playwright.config.ts`).
 */

const ARTIFACTS = "/tmp/editable-links-artifacts";

/**
 * Two notes. `alpha.md` carries a parked-caret line, a link line mid-document
 * (one concealed Markdown link and one concealed aliased wiki link, both to
 * `bravo.md`), and enough filler to keep the link line off the scroller edge.
 */
const LINK_VAULT_DOCS: Record<string, string> = {
  "alpha.md": [
    "# Alpha Doc",
    "",
    "alpha parked line",
    "",
    "see [Open bravo](bravo.md) and [[Bravo|the wiki route]] now",
    "",
    ...Array.from({ length: 20 }, (_, i) => `alpha filler line ${i + 1}`),
    "alpha tail line"
  ].join("\n"),
  "bravo.md": ["# Bravo Doc", "", "bravo body line"].join("\n")
};

const backButton = (page: Page) => page.getByRole("button", { name: "Back", exact: true });
const forwardButton = (page: Page) =>
  page.getByRole("button", { name: "Forward", exact: true });
const stripTab = (page: Page, title: string) =>
  page.locator(`[data-tab-id] button[title="${title}"]`);
const editor = (page: Page) => page.locator(".cm-content");
const linkLine = (page: Page) => page.locator(".cm-line", { hasText: "the wiki route" });
const markdownLink = (page: Page) =>
  page.locator(".cm-link-resolved", { hasText: "Open bravo" });
const wikiLink = (page: Page) => page.locator(".cm-link-resolved", { hasText: "the wiki route" });
const onAlpha = async (page: Page) => {
  await expect(editor(page).getByText(/Alpha Doc/)).toBeVisible();
  await expect(editor(page).getByText(/Bravo Doc/)).toHaveCount(0);
};
const onBravo = (page: Page) => expect(editor(page).getByText(/Bravo Doc/)).toBeVisible();

/** Opens alpha.md with the vault installed and the editor visible. */
async function openAlpha(page: Page) {
  await installHistoryVault(page, LINK_VAULT_DOCS);
  await page.goto("/");
  await page.getByRole("button", { name: "Open alpha.md" }).click();
  await expect(editor(page).getByText(/Alpha Doc/)).toBeVisible();
}

test("a concealed Markdown link follows on a plain press — no caret planted first", async ({
  page
}) => {
  await openAlpha(page);

  // Record the raw press sequence and where each event lands: pointerdown →
  // mousedown → mouseup → click, with the target's class list at dispatch.
  // This is the evidence for whether the release still hits the link after
  // CodeMirror's own selection handling runs.
  await page.evaluate(() => {
    const log: string[] = [];
    const seen = (event: Event) => {
      const target = event.target as HTMLElement | null;
      const me = event as MouseEvent;
      log.push(
        `${event.type}@(${me.clientX},${me.clientY}) on <${target?.tagName ?? "?"}> ` +
          `class="${target?.className ?? ""}" defaultPrevented=${event.defaultPrevented}`
      );
    };
    for (const type of ["pointerdown", "mousedown", "mouseup", "click"]) {
      document.addEventListener(type, seen, true);
    }
    (window as { __linkEventLog?: string[] }).__linkEventLog = log;
  });

  // Park the caret on a different line first: the press must not move it —
  // Back returning the pre-press caret is the proof.
  await editor(page).getByText("alpha parked line", { exact: true }).click();
  const parked = await settledEditorSpot(page);
  expect(parked.selectionLine).toBe("alpha parked line");

  // Press near the link's left edge: the concealed `[` sits just left of the
  // visible text, so a release after a reveal would land on revealed syntax,
  // not on the link element — the exact retarget the fix must survive.
  const linkBox = (await markdownLink(page).boundingBox())!;
  await markdownLink(page).click({ position: { x: 2, y: linkBox.height / 2 } });
  const eventLog = await page.evaluate(
    () => (window as { __linkEventLog?: string[] }).__linkEventLog ?? []
  );
  console.log("press event trace:", JSON.stringify(eventLog));
  await onBravo(page);

  // Back must return the caret to the parked line — if the press had moved
  // the caret into the link, history would have recorded it there instead.
  await backButton(page).click();
  await onAlpha(page);
  const restored = await settledEditorSpot(page);
  expect(restored.selectionLine).toBe(parked.selectionLine);
  expect(restored.selectionOffset).toBe(parked.selectionOffset);

  await page.screenshot({ path: `${ARTIFACTS}/desktop-01-after-back.png` });
  await expectNoNativeFailures(page);
});

test("a concealed wiki link follows on a plain press", async ({ page }) => {
  await openAlpha(page);
  await expect(wikiLink(page)).toHaveText("the wiki route");

  await wikiLink(page).click();
  await onBravo(page);

  await expectNoNativeFailures(page);
});

test("a keyboard-revealed link edits on plain click and follows on Mod+click", async ({
  page
}) => {
  await openAlpha(page);

  // Enter the link with the keyboard: caret at line end, ArrowLeft over
  // " now" lands it inside the link range — boundary counts as touching, so
  // the syntax reveals without any pointer press on the link itself.
  const lineBox = (await linkLine(page).boundingBox())!;
  await linkLine(page).click({ position: { x: lineBox.width - 6, y: lineBox.height / 2 } });
  await page.keyboard.press("End");
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowLeft");
  const revealed = page.locator(".cm-link-resolved.cm-link-revealed", {
    hasText: "the wiki route"
  });
  await expect(revealed).toBeVisible();

  // Revealed + plain click = edit: caret moves inside the link, no navigation.
  await revealed.click();
  await onAlpha(page);
  const edited = await settledEditorSpot(page);
  expect(edited.selectionLine).toContain("the wiki route");

  // Revealed + Mod+click = explicit follow.
  await revealed.click({ modifiers: ["Control"] });
  await onBravo(page);

  await expectNoNativeFailures(page);
});

test("a link replaces a permanent tab; the target's other-trail tab survives", async ({
  page
}) => {
  await openAlpha(page);
  // Alpha must be permanent — a preview tab already reuses its slot, which
  // would make the "same tab" half of the user's scenario untested.
  await stripTab(page, "alpha.md").dblclick();

  // Bravo in a second physical tab — its own trail, its own view id.
  await page.getByRole("button", { name: "Open bravo.md" }).click();
  await onBravo(page);
  await stripTab(page, "bravo.md").dblclick();
  const tabs = page.locator("[data-tab-id]");
  await expect(tabs).toHaveCount(2);

  // Back on alpha's strip slot, follow the concealed link: the document in
  // slot 0 becomes a *new* bravo view — bravo's own tab keeps its canonical
  // view id, so the collision mints a `…:view:N` id rather than stealing it.
  await stripTab(page, "alpha.md").click();
  await onAlpha(page);
  await markdownLink(page).click();
  await onBravo(page);
  await expect(tabs).toHaveCount(2);
  await expect(stripTab(page, "bravo.md")).toHaveCount(2);

  // Back puts alpha's document back in the same slot.
  await backButton(page).click();
  await onAlpha(page);
  await expect(tabs).toHaveCount(2);

  // Bravo's own trail holds only its seed visit — Back is dead over there,
  // and must never reach into alpha's trail.
  await stripTab(page, "bravo.md").last().click();
  await expect(backButton(page)).toBeDisabled();
  await expect(forwardButton(page)).toBeDisabled();

  // Returning to alpha's slot restores its remembered cursor: Forward is
  // still armed and walks back to the bravo view.
  await stripTab(page, "alpha.md").click();
  await expect(forwardButton(page)).toBeEnabled();
  await forwardButton(page).click();
  await onBravo(page);
  await expect(stripTab(page, "bravo.md")).toHaveCount(2);
  await expectNoNativeFailures(page);
});

test("drags never follow — started outside or inside the link", async ({ page }) => {
  await openAlpha(page);
  const link = markdownLink(page);
  const linkBox = (await link.boundingBox())!;
  const linkCenter = { x: linkBox.x + linkBox.width / 2, y: linkBox.y + linkBox.height / 2 };

  // Press outside, release on the link: a selection gesture, not a follow.
  const lineBox = (await linkLine(page).boundingBox())!;
  await page.mouse.move(lineBox.x + 4, lineBox.y + lineBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(linkCenter.x, linkCenter.y, { steps: 8 });
  await page.mouse.up();
  await onAlpha(page);

  // Press on the link, drag off it: the pointermove cancels the gesture.
  await page.mouse.move(linkCenter.x, linkCenter.y);
  await page.mouse.down();
  await page.mouse.move(linkCenter.x + 60, linkCenter.y + 40, { steps: 8 });
  await page.mouse.up();
  await onAlpha(page);

  await page.screenshot({ path: `${ARTIFACTS}/desktop-02-drags.png` });
  await expectNoNativeFailures(page);
});

test("a secondary-button press on a concealed link does not follow", async ({ page }) => {
  await openAlpha(page);
  await markdownLink(page).click({ button: "right" });
  await onAlpha(page);
  await expectNoNativeFailures(page);
});

test("source mode: a plain click edits the link text, Mod+click follows", async ({ page }) => {
  await openAlpha(page);

  // Source mode via the palette command — flips `editor.livePreview` off.
  await page.keyboard.press("Control+p");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await palette.getByRole("combobox", { name: "Search commands" }).fill("Toggle live preview");
  await page.keyboard.press("Enter");
  await expect(palette).not.toBeVisible();
  await expect(linkLine(page)).toContainText("[Open bravo](bravo.md)");
  await expect(page.locator(".cm-link-resolved")).toHaveCount(0);

  // A plain click on the raw syntax is an edit: caret lands, nothing opens.
  const lineBox = (await linkLine(page).boundingBox())!;
  const linkSpot = { x: 120, y: lineBox.height / 2 }; // ~12 chars in — inside the link syntax
  await linkLine(page).click({ position: linkSpot });
  await onAlpha(page);
  const edited = await settledEditorSpot(page);
  expect(edited.selectionLine).toContain("[Open bravo](bravo.md)");

  // Mod+click still follows in source mode.
  await linkLine(page).click({ position: linkSpot, modifiers: ["Control"] });
  await onBravo(page);

  await expectNoNativeFailures(page);
});
