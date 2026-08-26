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
 * names are prefixes or substrings of others — "Navigation" is inside "Open
 * navigation" and "Primary navigation", "Document tools" names both the header
 * button and the sheet it opens — and `getByLabel` matches substrings.
 */

test.describe("phone shell", () => {
  test("shows phone chrome and no activity rail", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("main", { name: "ThinkBrain mobile workspace" })).toBeVisible();
    await expect(page.getByRole("main", { name: "ThinkBrain desktop workspace" })).toHaveCount(0);
    await expect(page.getByRole("complementary", { name: "Workspace sections" })).toHaveCount(0);
    // The hub stands in for the rail, so its absence would not be caught above.
    await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  });

  test("opens the same drawer from the header and the hub", async ({ page }) => {
    await page.goto("/");

    const drawer = page.getByRole("dialog", { name: "Navigation" });

    await page.getByRole("button", { name: "Open navigation" }).tap();
    await expect(drawer).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);

    await page.getByRole("button", { name: "Menu", exact: true }).tap();
    await expect(drawer).toBeVisible();
  });

  test("reaches the inspectors that the desktop hides on narrow screens", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Document tools" }).tap();

    const sheet = page.getByRole("dialog", { name: "Document tools" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("tab", { name: "Outline" })).toBeVisible();
    await expect(sheet.getByRole("tab", { name: "Properties" })).toBeVisible();
  });

  test("switches tabs from the header count", async ({ page }) => {
    await page.goto("/");

    // The count is part of the accessible name, so the header button and the
    // sheet it opens never collide.
    await page.getByRole("button", { name: /^Open tabs \(\d+\)$/ }).tap();

    await expect(page.getByRole("dialog", { name: "Open tabs" })).toBeVisible();
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
