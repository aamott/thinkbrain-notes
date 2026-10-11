import { expect, test, type Page } from "@playwright/test";

/**
 * Regression coverage for the phone UI cleanup: touch scale, settings
 * density, floating-bubble shadows, and settings-nav overlay lifecycle.
 *
 * Runs only under the `phone` project (filename convention in
 * `playwright.config.ts`), so `pointer: coarse` + narrow viewport are real.
 * The desktop-scale check builds its own fine-pointer context inside the
 * same spec instead of trusting the desktop project to pick this file up.
 */

const settingsHeader = (page: Page) => page.getByTestId("settings-header-bar");
const filesPanel = (page: Page) => page.locator('[aria-label="Files panel"]');
const settingsNav = (page: Page) => page.locator("#settings-navigation");

/** Opens Settings through the navigation drawer, as a user would. */
async function openSettings(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Main menu" }).tap();
  await page
    .getByRole("dialog", { name: "Navigation" })
    .getByRole("button", { name: "Settings" })
    .tap();
  await expect(settingsHeader(page)).toBeVisible();
}

const rootFontSize = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).fontSize);

const bubbleShadow = (page: Page, key: string) =>
  page.locator(`[data-bubble="${key}"]`).evaluate((el) => getComputedStyle(el).boxShadow);

test.describe("phone ui cleanup", () => {
  test("applies the 110% touch default and proportional settings type", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("main", { name: "ThinkBrain mobile workspace" })).toBeVisible();
    expect(await rootFontSize(page)).toBe("17.6px");

    await openSettings(page);
    // The scale is a root-font-size change, not a zoom: opening Settings
    // must not move it.
    expect(await rootFontSize(page)).toBe("17.6px");

    const label = page.locator("main label[for]").first();
    await expect(label).toBeVisible();
    expect(await label.evaluate((el) => getComputedStyle(el).fontSize)).toBe("15.4px");
    const description = label.locator("xpath=..").locator("p").first();
    expect(await description.evaluate((el) => getComputedStyle(el).fontSize)).toBe("13.2px");

    // Theme picker and UI-scale selects keep >= 44px touch targets.
    for (const id of ["theme-picker-select", "ui.scale"]) {
      const control = page.locator(`select[id="${id}"]`);
      await expect(control).toBeVisible();
      const height = await control.evaluate((el) => el.getBoundingClientRect().height);
      expect(height).toBeGreaterThanOrEqual(44);
    }
  });

  for (const width of [360, 412]) {
    test(`settings header fits ${width}px with a dirty Save and no horizontal overflow`, async ({
      page
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      await openSettings(page);

      // Staging the theme makes Save the live control: it must fit too.
      await page.locator('select[id="theme-picker-select"]').selectOption("dark");
      const save = page.getByRole("button", { name: /^Save/ });
      await expect(save).toBeEnabled();

      const boxes = await page.evaluate(() => {
        const rect = (selector: string) => {
          const el = document.querySelector(selector);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { left: r.left, right: r.right };
        };
        return {
          hamburger: rect('[aria-label="Open settings navigation"]'),
          more: rect('[aria-label="More settings actions"]'),
          save: rect('header [data-testid="settings-header-bar"] button:not([disabled])')
        };
      });
      const saveBox = await save.boundingBox();
      expect(boxes.hamburger).not.toBeNull();
      expect(boxes.more).not.toBeNull();
      expect(saveBox).not.toBeNull();
      // Hamburger leads on the left; More trails on the right — neither may
      // reach across the Save button.
      expect(boxes.hamburger!.right).toBeLessThanOrEqual(saveBox!.x + 1);
      expect(boxes.more!.left).toBeGreaterThanOrEqual(saveBox!.x + saveBox!.width - 1);

      const overflow = await page.evaluate(() => {
        // The shell root's own scrollWidth is not a fair measure: always-
        // mounted sheets translated off-screen enlarge it while clipped.
        const content = document.querySelector('[data-testid="settings-content-scroll"]');
        return {
          document: document.documentElement.scrollWidth,
          content: content ? content.scrollWidth : 0,
          contentClient: content?.clientWidth ?? 0,
          client: document.documentElement.clientWidth
        };
      });
      expect(overflow.document).toBeLessThanOrEqual(overflow.client);
      expect(overflow.content).toBeLessThanOrEqual(overflow.contentClient);
    });
  }

  test("Settings Back returns to Files and Forward revisits Settings", async ({ page }) => {
    await page.goto("/");
    await openSettings(page);

    await page.locator('header [aria-label="Back"]').tap();
    await expect(filesPanel(page)).toBeVisible();
    await expect(settingsHeader(page)).toBeHidden();

    await page.locator('header [aria-label="Forward"]').tap();
    await expect(settingsHeader(page)).toBeVisible();
  });

  test("Search Back/Forward follows the drawer destination chain", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Main menu" }).tap();
    await page
      .getByRole("dialog", { name: "Navigation" })
      .getByRole("button", { name: "Search" })
      .tap();
    const searchPanel = page.locator('[aria-label="Search panel"]');
    await expect(searchPanel).toBeVisible();

    await page.locator('header [aria-label="Back"]').tap();
    await expect(filesPanel(page)).toBeVisible();
    await page.locator('header [aria-label="Forward"]').tap();
    await expect(searchPanel).toBeVisible();
  });

  test("a hidden settings nav cannot trap a native browser Back", async ({ page }) => {
    await page.goto("/");
    await openSettings(page);
    await page.getByRole("button", { name: "Open settings navigation" }).tap();
    await expect(settingsNav(page)).toHaveAttribute("data-open", "true");

    // Browser Back pops the route beneath the open drawer; the still-mounted
    // settings tab must close it so nothing invisible stays registered.
    await page.goBack();
    await expect(filesPanel(page)).toBeVisible();
    await expect(settingsNav(page)).toHaveAttribute("data-open", "false");

    await page.goForward();
    await expect(settingsHeader(page)).toBeVisible();
    await expect(settingsNav(page)).toHaveAttribute("data-open", "false");
  });

  test("primary bubble keeps a real shadow resting and open, light and dark", async ({
    browser
  }) => {
    for (const colorScheme of ["light", "dark"] as const) {
      const context = await browser.newContext({
        viewport: { width: 412, height: 915 },
        isMobile: true,
        hasTouch: true,
        colorScheme
      });
      const page = await context.newPage();
      try {
        await page.goto("/");
        const bubble = page.locator('[data-bubble="new-note"]');
        await expect(bubble).toBeVisible();
        const expectedBlur = colorScheme === "light" ? "0px 4px 12px" : "0px 4px 14px";

        const resting = await bubbleShadow(page, "new-note");
        expect(resting).not.toBe("none");
        expect(resting).toContain(expectedBlur);

        await bubble.tap();
        await expect(page.getByRole("menu", { name: "New note actions" })).toBeVisible();
        const open = await bubbleShadow(page, "new-note");
        expect(open).not.toBe("none");
        expect(open).toContain(expectedBlur);
      } finally {
        await context.close();
      }
    }
  });

  test("a fine-pointer desktop context keeps the 100% default", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      isMobile: false,
      hasTouch: false
    });
    const page = await context.newPage();
    try {
      await page.goto("/");
      await expect(page.getByRole("main", { name: "ThinkBrain desktop workspace" })).toBeVisible();
      expect(await rootFontSize(page)).toBe("16px");
    } finally {
      await context.close();
    }
  });
});
