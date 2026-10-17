import { expect, test, type Page } from "@playwright/test";

import { expectNoNativeFailures, installHistoryVault, settledEditorSpot } from "./locationHistoryHarness";

/**
 * Location-centric history regressions — desktop chrome.
 *
 * The contract under test: every *navigation gesture* (opening a file, an
 * outline heading jump) records a location — document + scroll + selection —
 * and title-bar Back/Forward re-walks those locations like a browser. The
 * assertions read the real viewport (`.cm-scroller`, first visible `.cm-line`)
 * and the DOM Selection, never the internal history model.
 *
 * Desktop-project spec (filename convention in `playwright.config.ts`).
 */

const ARTIFACTS = "/tmp/location-history-artifacts";

const backButton = (page: Page) => page.getByRole("button", { name: "Back", exact: true });
const forwardButton = (page: Page) => page.getByRole("button", { name: "Forward", exact: true });
const editor = (page: Page) => page.locator(".cm-content");

test("an outline heading jump is a location: Back restores scroll and selection, Forward returns to the heading", async ({
  page
}) => {
  await installHistoryVault(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Open guide.md" }).click();
  await expect(page.locator(".cm-scroller")).toBeVisible();

  // Open the outline *before* measuring so the jump and the restore are read
  // against one layout — the dock takes editor width when it opens.
  await page.getByRole("button", { name: "Outline", exact: true }).click();
  const outline = page.getByRole("navigation", { name: "Note outline" });
  await expect(outline).toBeVisible();

  // Park mid-document, then click a real caret into the first visible line.
  const scroller = page.locator(".cm-scroller");
  await scroller.evaluate((el) => {
    el.scrollTop = el.scrollHeight / 2;
  });
  const parked = await settledEditorSpot(page);
  expect(parked.firstLine).not.toBeNull();
  await editor(page).getByText(parked.firstLine!, { exact: true }).click();
  const before = await settledEditorSpot(page);
  expect(before.selectionLine).toBe(parked.firstLine);

  // The heading tap is a navigation gesture: it records a visit and lands on
  // the heading's line, scrolled into the viewport.
  const betaButton = outline.getByRole("button", { name: "Beta Section" });
  await betaButton.click();
  const jumped = await settledEditorSpot(page);
  await page.screenshot({ path: `${ARTIFACTS}/desktop-01-after-outline-jump.png` });
  expect(jumped.visibleLines.some((text) => text.includes("Beta Section"))).toBe(true);
  expect(jumped.firstLine).not.toBe(before.firstLine);

  // Re-activating the heading you are already on is a no-op location-wise:
  // it must not stack a duplicate entry — proof: a single Back returns to the
  // pre-jump spot rather than landing on Beta again.
  await betaButton.click();
  const relanded = await settledEditorSpot(page);
  expect(relanded.visibleLines.some((text) => text.includes("Beta Section"))).toBe(true);
  await backButton(page).click();
  const restored = await settledEditorSpot(page);
  await page.screenshot({ path: `${ARTIFACTS}/desktop-02-after-back.png` });
  expect(restored.firstLine).toBe(before.firstLine);
  expect(Math.abs(restored.scrollTop - before.scrollTop)).toBeLessThanOrEqual(2);
  // A revisit lands the caret where the user left it — the selection half of
  // the location entry, visible through the DOM Selection.
  expect(restored.selectionLine).toBe(before.selectionLine);
  expect(restored.editorFocused).toBe(true);

  // Forward re-walks the jump to the heading.
  await forwardButton(page).click();
  const forward = await settledEditorSpot(page);
  expect(forward.visibleLines.some((text) => text.includes("Beta Section"))).toBe(true);

  // An edit at the landing spot is user content, not a history hop: Back must
  // navigate without reverting it, and undo must still reach it afterwards.
  await editor(page).getByText(/Beta Section/).click();
  await page.keyboard.type("TRAIL-MARK ");
  await expect(page.getByLabel("Unsaved changes")).toBeVisible();

  await backButton(page).click();
  await settledEditorSpot(page);
  // Reverting the text would clear the dirty marker — it must survive.
  await expect(page.getByLabel("Unsaved changes")).toBeVisible();

  await forwardButton(page).click();
  const marked = editor(page).getByText(/TRAIL-MARK/);
  await expect(marked).toBeVisible();

  await marked.click();
  await page.keyboard.press("Control+z");
  await expect(editor(page).getByText(/TRAIL-MARK/)).toHaveCount(0);

  // Omega Tail sits so close to the end that the scroller clamps before the
  // heading can top the viewport — a jump there is still a location, and Back
  // still returns to where it was triggered from.
  const atBeta = await settledEditorSpot(page);
  await outline.getByRole("button", { name: "Omega Tail" }).click();
  const atTail = await settledEditorSpot(page);
  expect(atTail.visibleLines.some((text) => text.includes("Omega Tail"))).toBe(true);
  expect(atTail.firstLine).not.toBe(atBeta.firstLine);
  await backButton(page).click();
  const backFromTail = await settledEditorSpot(page);
  expect(backFromTail.firstLine).toBe(atBeta.firstLine);
  expect(Math.abs(backFromTail.scrollTop - atBeta.scrollTop)).toBeLessThanOrEqual(2);

  await expectNoNativeFailures(page);
});

test("a preview takeover stays on the Back stack and an explicitly closed file is never revisited", async ({
  page
}) => {
  await installHistoryVault(page);
  await page.goto("/");

  // A permanent anchor tab keeps a live surface under the close checks —
  // whether Back can resurrect a displaced preview after *last-tab* close is
  // outside this story and is not asserted.
  await page.getByRole("button", { name: "Open guide.md" }).click();
  await expect(editor(page).getByText(/Guide Alpha/)).toBeVisible();
  await page.locator('[data-tab-id] button[title="guide.md"]').dblclick();

  await page.getByRole("button", { name: "Open alpha.md" }).click();
  await expect(editor(page).getByText(/Alpha Doc/)).toBeVisible();
  await page.getByRole("button", { name: "Open bravo.md" }).click();
  await expect(editor(page).getByText(/Bravo Doc/)).toBeVisible();

  // B took over the standing preview tab, yet the two opens are distinct
  // visits: Back must show A's content again even though its tab was
  // displaced.
  await backButton(page).click();
  await expect(editor(page).getByText(/Alpha Doc/)).toBeVisible();
  await expect(editor(page).getByText(/Bravo Doc/)).toHaveCount(0);

  await forwardButton(page).click();
  await expect(editor(page).getByText(/Bravo Doc/)).toBeVisible();

  // An explicit close scrubs B's visits: whichever direction remains enabled,
  // walking history can never land on the dead file again.
  await page.getByRole("button", { name: "Close bravo.md" }).click();
  const tabs = page.getByRole("navigation", { name: "Open tabs" });
  await expect(tabs).not.toContainText("bravo.md");
  await expect(editor(page).getByText(/Bravo Doc/)).toHaveCount(0);

  for (const nav of [backButton(page), forwardButton(page)]) {
    if (await nav.isEnabled()) {
      await nav.click();
      await settledEditorSpot(page);
      await expect(editor(page).getByText(/Bravo Doc/)).toHaveCount(0);
      await expect(tabs).not.toContainText("bravo.md");
    }
  }
  await page.screenshot({ path: `${ARTIFACTS}/desktop-03-after-close.png` });
  await expectNoNativeFailures(page);
});

test("a repeated tail-heading jump records once: one Back returns to the previous heading", async ({
  page
}) => {
  await installHistoryVault(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Open guide.md" }).click();
  await expect(page.locator(".cm-scroller")).toBeVisible();
  await page.getByRole("button", { name: "Outline", exact: true }).click();
  const outline = page.getByRole("navigation", { name: "Note outline" });
  await expect(outline).toBeVisible();

  // Land on Beta first so history holds an earlier place to return to.
  await outline.getByRole("button", { name: "Beta Section" }).click();
  const atBeta = await settledEditorSpot(page);
  expect(atBeta.visibleLines.some((text) => text.includes("Beta Section"))).toBe(true);

  // Omega Tail is near the document end: `scrollIntoView` clamps the
  // scroller at the bottom, so the landed target sits *inside* the viewport
  // rather than at its top edge. The dedupe must recognise that shape too —
  // clicking the same heading twice is still one visit.
  const omegaButton = outline.getByRole("button", { name: "Omega Tail" });
  await omegaButton.click();
  const atTail = await settledEditorSpot(page);
  expect(atTail.visibleLines.some((text) => text.includes("Omega Tail"))).toBe(true);
  expect(atTail.selectionLine).toContain("Omega Tail");
  await omegaButton.click();
  await settledEditorSpot(page);

  // Had the second click stacked a duplicate visit, this Back would land on
  // Omega again — it must reach Beta in one step instead.
  await backButton(page).click();
  const back = await settledEditorSpot(page);
  await page.screenshot({ path: `${ARTIFACTS}/desktop-04-tail-dedupe-back.png` });
  expect(back.selectionLine).toContain("Beta Section");
  expect(back.visibleLines.some((text) => text.includes("Omega Tail"))).toBe(false);

  await expectNoNativeFailures(page);
});
