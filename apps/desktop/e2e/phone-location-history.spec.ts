import { expect, test, type Page } from "@playwright/test";

import { expectNoNativeFailures, installHistoryVault, settledEditorSpot } from "./locationHistoryHarness";

/**
 * Location-centric history regressions — phone chrome.
 *
 * Runs only under the `phone` project (filename convention in
 * `playwright.config.ts`), so coarse pointer + the narrow viewport — and thus
 * `PhoneShell` and the browser-history stack in `usePhoneNavigation` — are
 * real. Assertions read the rendered editor viewport and the DOM Selection,
 * not the history model, and the Android hardware-Back bridge
 * (`window.__thinkbrainHandleAndroidBack`) is exercised through the same
 * entry point `MainActivity` calls.
 */

const ARTIFACTS = "/tmp/location-history-artifacts";

const headerBack = (page: Page) => page.locator('header [aria-label="Back"]');
const headerForward = (page: Page) => page.locator('header [aria-label="Forward"]');
const filesPanel = (page: Page) => page.locator('[aria-label="Files panel"]');
const editor = (page: Page) => page.locator(".cm-content");
const actionItems = (page: Page) => page.getByRole("menu", { name: "Action items" });

/** The Android hardware-Back entry point; `null` when the bridge is gone. */
const androidBack = (page: Page) =>
  page.evaluate(
    () =>
      (window as { __thinkbrainHandleAndroidBack?: () => boolean }).__thinkbrainHandleAndroidBack?.() ??
      null
  );

/** Opens the outline inside the inspector drawer through the ⋮ bubble. */
async function openOutlineInspector(page: Page) {
  await page.locator('[data-bubble="actions"]').tap();
  await actionItems(page).getByRole("menuitem", { name: "Outline" }).tap();
  const inspector = page.getByRole("dialog", { name: "Inspector" });
  await expect(inspector).toBeVisible();
  return inspector;
}

test("Files → note → outline jump → Back restores the note position → Back home", async ({ page }) => {
  await installHistoryVault(page);
  await page.goto("/");

  await expect(page.getByRole("main", { name: "ThinkBrain mobile workspace" })).toBeVisible();
  await expect(filesPanel(page)).toBeVisible();

  // Files home → open the note and park it mid-document with a real caret.
  await page.getByRole("button", { name: "Open guide.md" }).tap();
  const scroller = page.locator(".cm-scroller");
  await expect(scroller).toBeVisible();
  await scroller.evaluate((el) => {
    el.scrollTop = el.scrollHeight / 2;
  });
  const parked = await settledEditorSpot(page);
  expect(parked.firstLine).not.toBeNull();
  await editor(page).getByText(parked.firstLine!, { exact: true }).tap();
  const before = await settledEditorSpot(page);
  expect(before.selectionLine).toBe(parked.firstLine);

  // Android hardware Back dismisses a history-backed overlay before content
  // routes — same precedence as the header button. The inspector is the
  // actions menu's child, so stepping out resurfaces that menu.
  let inspector = await openOutlineInspector(page);
  expect(await androidBack(page)).toBe(true);
  await expect(inspector).toBeHidden();
  await expect(scroller).toBeVisible();

  await actionItems(page).getByRole("menuitem", { name: "Outline" }).tap();
  inspector = page.getByRole("dialog", { name: "Inspector" });
  await expect(inspector).toBeVisible();

  // The heading tap navigates the note; the sheet gives up its history slot.
  await inspector.getByRole("button", { name: "Beta Section" }).tap();
  await expect(inspector).toBeHidden();
  const jumped = await settledEditorSpot(page);
  expect(jumped.visibleLines.some((text) => text.includes("Beta Section"))).toBe(true);
  expect(jumped.firstLine).not.toBe(before.firstLine);
  await page.screenshot({ path: `${ARTIFACTS}/phone-01-after-outline-jump.png` });

  // One header Back returns the recorded position in the note, not Files.
  await headerBack(page).tap();
  const restored = await settledEditorSpot(page);
  expect(restored.firstLine).toBe(before.firstLine);
  expect(Math.abs(restored.scrollTop - before.scrollTop)).toBeLessThanOrEqual(2);
  await page.screenshot({ path: `${ARTIFACTS}/phone-02-back-to-position.png` });
  // A revisit lands the caret where the user left it — the selection half of
  // the location entry, visible through the DOM Selection.
  expect(restored.selectionLine).toBe(before.selectionLine);

  // Forward re-walks the heading jump, then Back again lands the position.
  await headerForward(page).tap();
  const forward = await settledEditorSpot(page);
  expect(forward.visibleLines.some((text) => text.includes("Beta Section"))).toBe(true);
  await headerBack(page).tap();
  const reparked = await settledEditorSpot(page);
  expect(reparked.firstLine).toBe(before.firstLine);

  // One more step reaches Files home; at the root the bridge declines so the
  // OS applies its own Back behaviour instead of the app swallowing it.
  expect(await androidBack(page)).toBe(true);
  await expect(filesPanel(page)).toBeVisible();
  expect(await androidBack(page)).toBe(false);

  await expectNoNativeFailures(page);
});

test("a link follow replaces the note's tab: Back reopens the replaced document", async ({ page }) => {
  await installHistoryVault(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Open alpha.md" }).tap();
  await expect(editor(page).getByText(/Alpha Doc/)).toBeVisible();

  // A concealed link follows on tap — the phone opener fills the tab on
  // screen, so B displaces A's tab outright.
  await editor(page).getByText("Open bravo", { exact: true }).tap();
  await expect(editor(page).getByText(/Bravo Doc/)).toBeVisible();
  await expect(filesPanel(page)).toBeHidden();

  // The tab is gone, but A's *location* is still on the stack: Back must
  // reopen it and show its content, not strand the user on a ghost entry.
  await headerBack(page).tap();
  await expect(editor(page).getByText(/Alpha Doc/)).toBeVisible();
  // Reopening A fills the same single tab — the header's count must not grow.
  await expect(page.getByRole("button", { name: "Open tabs (1)" })).toBeVisible();
  await page.screenshot({ path: `${ARTIFACTS}/phone-03-back-reopens-alpha.png` });
  await expectNoNativeFailures(page);
});

test("switching tabs hands Back/Forward to the selected trail", async ({ page }) => {
  await installHistoryVault(page);
  await page.goto("/");
  const headerForward = page.locator('header [aria-label="Forward"]');
  const tabSheet = page.getByRole("dialog", { name: "Open tabs" });

  // Trail A: alpha → bravo, then Back leaves bravo as A's pending Forward.
  await page.getByRole("button", { name: "Open alpha.md" }).tap();
  await expect(editor(page).getByText(/Alpha Doc/)).toBeVisible();
  await editor(page).getByText("Open bravo", { exact: true }).tap();
  await expect(editor(page).getByText(/Bravo Doc/)).toBeVisible();
  await headerBack(page).tap();
  await expect(editor(page).getByText(/Alpha Doc/)).toBeVisible();
  await expect(headerForward).toBeEnabled();

  // A second physical tab gets its own trail — A's pending Forward must not
  // leak across once the browser stack belongs to the new trail.
  await page.getByRole("button", { name: "Open tabs (1)" }).tap();
  await tabSheet.getByRole("button", { name: "New tab" }).tap();
  await page.getByRole("button", { name: "Browse files" }).tap();
  await page.getByRole("button", { name: "Open bravo.md" }).tap();
  await expect(editor(page).getByText(/Bravo Doc/)).toBeVisible();
  await expect(headerForward).toBeDisabled();

  // Selecting A's card rebases the browser segment to A's trail: Forward is
  // still armed and walks back to bravo inside the same tab.
  await page.getByRole("button", { name: "Open tabs (2)" }).tap();
  await tabSheet.getByRole("button", { name: /^alpha/ }).tap();
  await expect(editor(page).getByText(/Alpha Doc/)).toBeVisible();
  await expect(headerForward).toBeEnabled();
  await headerForward.tap();
  await expect(editor(page).getByText(/Bravo Doc/)).toBeVisible();
  await expect(headerBack(page)).toBeEnabled();
  await expect(page.getByRole("button", { name: "Open tabs (2)" })).toBeVisible();
  await expectNoNativeFailures(page);
});
