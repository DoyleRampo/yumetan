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
// "Read this dream" opens the reading page; Save lives there.
export async function submitDream(page) {
  await page.locator("[data-action=diagnose]").click();
  await expect(page.locator("#app")).toHaveAttribute("data-page", "reading");
  await page.locator("[data-action=save-reading]").click();
}
// The writing card's tools open sheets over the page; × puts them away.
export async function openSheet(page, id) {
  await page.locator(`[data-sheet-open="${id}"]`).click();
  await expect(page.locator(`[data-sheet="${id}"]`)).toBeVisible();
}
export async function closeSheet(page, id) {
  await page.locator(`[data-sheet="${id}"] .sheet-head .popup-close`).click();
  await expect(page.locator(`[data-sheet="${id}"]`)).toBeHidden();
}
// Sleep lives in its own sheet on the dream page.
export async function fillSleep(page, { hours, awakenings, rested }) {
  await openSheet(page, "sleep");
  await page.locator("#include-sleep").check();
  await page.locator("#hours").fill(hours);
  await page.locator("#awakenings").fill(awakenings);
  await page.locator("#rested").selectOption(rested);
  await closeSheet(page, "sleep");
}
