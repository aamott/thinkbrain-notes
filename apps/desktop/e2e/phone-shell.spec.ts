import { expect, test } from "@playwright/test";

/**
 * Covers the phone chrome through the real gate.
 *
 * `usePhoneChrome()` is `pointer: coarse` **and** `max-width: 760px`, so this
 * file only means anything under the `phone` project (see
 * `playwright.config.ts`, which routes `phone-*.spec.ts` there). Every test
 * therefore asserts *positively* that the phone shell mounted: a mis-set
 * project renders desktop chrome, and a suite of negative assertions would
 * pass against it.
 *
 * Locators are pinned by role rather than by label alone. Several accessible
 * names overlap — "Navigation" names the drawer's dialog — and `getByLabel`
 * matches substrings.
 */

test.describe("phone shell", () => {
  test("shows phone chrome and no activity rail", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("main", { name: "ThinkBrain mobile workspace" })).toBeVisible();
    await expect(page.getByRole("main", { name: "ThinkBrain desktop workspace" })).toHaveCount(0);
    await expect(page.getByRole("complementary", { name: "Workspace sections" })).toHaveCount(0);
    // The floating bubbles stand in for the rail, so their absence would not
    // be caught above.
    await expect(page.getByRole("group", { name: "Quick actions" })).toBeVisible();
  });

  test("opens and dismisses the navigation drawer from the main menu", async ({ page }) => {
    await page.goto("/");

    const drawer = page.getByRole("dialog", { name: "Navigation" });
    await page.getByRole("button", { name: "Main menu" }).tap();
    await expect(drawer).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
  });

  test("reaches the inspectors that the desktop hides on narrow screens", async ({ page }) => {
    await page.goto("/");

    // "Actions" substring-matches the desktop header's "More actions"
    // button, so the bubble is pinned by its stable id, not its name.
    await page.locator('[data-bubble="actions"]').tap();

    const menu = page.getByRole("menu", { name: "Action items" });
    await expect(menu.getByRole("menuitem", { name: "Properties" })).toBeVisible();
    await menu.getByRole("menuitem", { name: "Outline" }).tap();

    const inspector = page.getByRole("dialog", { name: "Inspector" });
    await expect(inspector).toBeVisible();
    await expect(inspector.getByRole("heading", { name: "Outline" })).toBeVisible();
  });

  test("switches tabs from the header count", async ({ page }) => {
    await page.goto("/");

    // The count is part of the accessible name, so the header button and the
    // sheet it opens never collide.
    await page.getByRole("button", { name: /^Open tabs \(\d+\)$/ }).tap();

    await expect(page.getByRole("dialog", { name: "Open tabs" })).toBeVisible();
  });

  test("tapping a trigger bubble again closes its menu", async ({ page }) => {
    await page.goto("/");

    // While a menu is open its dismiss layer covers the shell; the second
    // tap on the trigger must still reach the bubble and toggle it closed
    // (the layer swallows pointerdown, then the retargeted click would
    // reopen it — the bubble group sits above the layer while a menu is up).
    const actions = page.locator('[data-bubble="actions"]');
    const actionsMenu = page.getByRole("menu", { name: "Action items" });
    await actions.tap();
    await expect(actionsMenu).toBeVisible();
    await actions.tap();
    await expect(actionsMenu).toHaveCount(0);

    const newNote = page.locator('[data-bubble="new-note"]');
    const newNoteMenu = page.getByRole("menu", { name: "New note actions" });
    await newNote.tap();
    await expect(newNoteMenu).toBeVisible();
    await newNote.tap();
    await expect(newNoteMenu).toHaveCount(0);
  });

  test("explorer header actions meet the 44px touch target", async ({ page }) => {
    await page.goto("/");

    const explorer = page.locator('section[aria-label="Workspace explorer"]');
    // The bubble strip also carries a "New note" button, so the explorer
    // scope matters — not just for readability but to avoid a strict-mode
    // collision.
    for (const name of ["New note", "New folder", "Sort files", "More actions"]) {
      const box = await explorer.getByRole("button", { name }).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
  });

  test("keeps desktop chrome at a wide viewport", async ({ page }) => {
    // Same coarse pointer, wide viewport: the width half of the gate alone
    // decides, so desktop chrome comes back.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    await expect(page.getByRole("main", { name: "ThinkBrain desktop workspace" })).toBeVisible();
    await expect(page.getByRole("main", { name: "ThinkBrain mobile workspace" })).toHaveCount(0);
  });
});
