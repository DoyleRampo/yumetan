import { expect } from "@playwright/test";
export async function finishIntroduction(page) {
  for (let step = 0; step < 4; step++) {
    await expect(page.locator("[data-intro-step]")).toHaveAttribute(
      "data-intro-step",
      String(step),
    );
    await page.locator("[data-action=intro-next]").click();
  }
  await expect(page.locator("#app")).toHaveAttribute(
    "data-page",
    "welcome-login",
  );
  const signed = page.locator("[data-action=intro-continue]");
  if (await signed.count()) await signed.click();
  else await page.locator("[data-action=guest]").click();
  await expect(page.locator('[data-answer="2"]')).toBeVisible();
}
