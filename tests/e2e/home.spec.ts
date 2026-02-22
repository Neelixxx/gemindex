import { expect, test } from "@playwright/test";

test("renders Gem Index shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Gem Index" }).first()).toBeVisible();
});
