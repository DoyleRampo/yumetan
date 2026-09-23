import { test, expect } from "@playwright/test";
async function ready(page) {
  await page.route("**/firebase-config.js*", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body: "window.FIREBASE_CONFIG={};",
    }),
  );
  await page.addInitScript(() =>
    localStorage.setItem(
      "yumetan.v4.local",
      JSON.stringify({
        version: 4,
        profile: {
          nickname: "ゆめ",
          ageGroup: "20代",
          language: "ja",
          typeAnswers: Array.from({ length: 16 }, (_, i) => (i === 11 ? 2 : 0)),
          characterSet: "human",
          updatedAt: new Date().toISOString(),
        },
        records: [],
        deleted: [],
      }),
    ),
  );
  await page.goto("/");
  await expect(page.locator("[data-action=catalog]")).toBeVisible();
}
async function noOverflow(page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  const outside = await page
    .locator("main button, main input, main select, main textarea, nav button")
    .evaluateAll((els) =>
      els
        .filter((el) => el.getClientRects().length)
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.x < -1 || r.right > innerWidth + 1;
        })
        .map((el) => el.outerHTML),
    );
  expect(outside).toEqual([]);
}
for (const [width, height] of [
  [320, 568],
  [375, 667],
  [390, 844],
  [430, 932],
  [768, 1024],
  [844, 390],
  [1024, 768],
  [1440, 900],
]) {
  test(`primary screens reflow at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await ready(page);
    await noOverflow(page);
    await page.locator("[data-action=catalog]").click();
    await expect(page.locator("[data-type-detail]")).toHaveCount(16);
    await page.locator("[data-catalog-group=lucid]").click();
    await expect(page.locator("[data-type-detail]")).toHaveCount(4);
    await page.locator("[data-type-detail=challenge]").click();
    await expect(page.locator("h1")).toHaveText("キロ");
    await expect(page.locator(".character-story")).toBeVisible();
    await noOverflow(page);
    await page.locator(".back-link").click();
    await expect(page.locator("[data-catalog-group=lucid]")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.locator("[data-catalog-group=all]").click();
    await expect(page.locator("[data-type-detail]")).toHaveCount(16);
    await noOverflow(page);
    await page.locator("#header [data-go=settings]").click();
    await page.locator("[data-go=plans]").click();
    await expect(page.locator(".plan-comparison thead th")).toHaveCount(3);
    await noOverflow(page);
    if (height >= 667) {
      const edges = await page.locator(".plan-comparison").evaluate((el) => ({
        bottom: el.getBoundingClientRect().bottom,
        nav: document.querySelector("nav").getBoundingClientRect().top,
      }));
      expect(edges.bottom).toBeLessThanOrEqual(edges.nav);
    }
    await page.locator("[data-social=yearly]").click();
    await page.locator(".plan-links [data-plan=standard]").click();
    await expect(page.locator("h1")).toHaveText("スタンダード");
    await expect(page.locator(".plan-card .plan-price")).toContainText("9,800");
    // Eight allowances: comments were removed with stamps as the only reaction.
    await expect(page.locator(".plan-card dl > div")).toHaveCount(8);
    await noOverflow(page);
    await page.locator(".back-link").click();
    await expect(page.locator("[data-social=yearly]")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.locator("nav [data-go=record]").click();
    await noOverflow(page);
    await page.locator(".theme-picker summary").click();
    await page.locator("[data-tag=challenge]").click();
    await page.locator("#include-sleep").check();
    await noOverflow(page);
    await expect(page.locator("#hours")).toBeVisible();
  });
}
test("long names, translated plans and 200% zoom retain readable controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await ready(page);
  await page.locator("#header [data-go=settings]").click();
  await page.locator("[data-action=profile]").click();
  await page.locator("#nickname").fill("W".repeat(20));
  await page.locator("#profile-form button[type=submit]").click();
  await page.evaluate(() => (document.documentElement.style.zoom = "2"));
  for (const lang of ["ja", "en", "ko", "zh"]) {
    await page.locator("#header [data-go=settings]").click();
    await page.locator("#language").selectOption(lang);
    await noOverflow(page);
    await page.locator("[data-go=plans]").click();
    await noOverflow(page);
    await page.locator(".plan-links [data-plan=starter]").click();
    await noOverflow(page);
    // Eight allowances: comments were removed with stamps as the only reaction.
    await expect(page.locator(".plan-card dl > div")).toHaveCount(8);
    await page.locator("nav [data-go=home]").click();
  }
});
