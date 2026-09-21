import { expect } from "@playwright/test";
export async function chooseDate(page, id, date) {
  await page.locator(`[data-date-field="${id}"]`).click();
  const month = date.slice(0, 7);
  while (
    (await page
      .locator("[data-calendar-month]")
      .getAttribute("data-calendar-month")) !== month
  ) {
    const current = await page
      .locator("[data-calendar-month]")
      .getAttribute("data-calendar-month");
    await page
      .locator(
        current > month ? "[data-calendar-prev]" : "[data-calendar-next]",
      )
      .click();
  }
  await page.locator(`[data-calendar-date="${date}"]`).click();
  await expect(page.locator("#" + id)).toHaveValue(date);
}
export async function savedDreamDetails(page) {
  await expect(page.locator("#dream-text")).toHaveValue("");
  await page.locator("[data-open-days=dream]").click();
  await page.locator("[data-entry]").first().click();
}
