import { expect, test } from "@playwright/test";

test("desktop scaffold boots in the browser harness", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Thinkbrain Notes" })).toBeVisible();
  await expect(page.getByText("Desktop scaffold")).toBeVisible();
});
