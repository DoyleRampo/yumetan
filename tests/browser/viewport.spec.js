import { test, expect } from "@playwright/test";

async function ready(page, records = []) {
  await page.route("**/firebase-config.js*", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: "window.FIREBASE_CONFIG = {};",
    }),
  );
  await page.addInitScript((records) => {
    localStorage.setItem(
      "yumetan.v4.local",
      JSON.stringify({
        version: 4,
        profile: {
          nickname: "ゆめ",
          ageGroup: "20代",
          typeAnswers: Array(16).fill(1),
        },
        records,
        deleted: [],
      }),
    );
  }, records);
  await page.goto("/");
  await expect(page.locator(".home-dashboard")).toBeVisible();
}
async function noVerticalScroll(page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollHeight <= innerHeight + 1 &&
          getComputedStyle(document.querySelector("#app")).overflowY ===
            "hidden",
      ),
    )
    .toBe(true);
}

test("a sheet keeps the writing draft and restores focus when it closes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await ready(page);
  await page.locator(".companion-action").click();
  await page.locator("#dream-text").fill("夢の記録");
  const opener = page.locator("[data-sheet-open=sleep]");
  const sheet = page.locator("[data-sheet=sleep]");
  await opener.click();
  await expect(sheet).toBeVisible();
  await expect(
    page.locator(".paper").filter({ has: page.locator("#dream-text") }),
  ).toHaveJSProperty("inert", true);
  await sheet.locator("#include-sleep").check();
  await sheet.locator("#hours").fill("7");
  await sheet.locator(".sheet-head button").click();
  await expect(sheet).toBeHidden();
  await expect(opener).toBeFocused();
  await expect(page.locator("#dream-text")).toHaveValue("夢の記録");
  await opener.click();
  await expect(sheet.locator("#hours")).toHaveValue("7");
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await noVerticalScroll(page);
});

test("the final lines of a long diary are reachable through panels in landscape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  const now = new Date();
  const date = now.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  await ready(page, [
    {
      id: "long-diary",
      kind: "diary",
      date,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      text: "一日の出来事を書きました。".repeat(360) + "日記の最後。",
    },
  ]);
  await page.locator("nav [data-go=diary]").click();
  await page.locator("[data-open-days=diary]").click();
  await page.locator("[data-entry=long-diary]").click();
  await expect(page.locator("#app")).toHaveAttribute("data-page", "detail");
  await noVerticalScroll(page);
  const controls = page.locator(".detail-text > .panel-controls");
  const next = controls.locator("button").last();
  await expect(next).toBeEnabled();
  for (let panel = 0; panel < 30 && (await next.isEnabled()); panel++) {
    await next.click();
    const visible = await page.evaluate(() => {
      const text = document.querySelector(
        ".detail-text .panel-flow .prose",
      ).firstChild;
      const range = document.createRange();
      range.setStart(text, text.length - 6);
      range.setEnd(text, text.length);
      const end = range.getBoundingClientRect();
      const bounds = document
        .querySelector(".detail-text > .panel-viewport")
        .getBoundingClientRect();
      return (
        end.left >= bounds.left &&
        end.right <= bounds.right &&
        end.top >= bounds.top &&
        end.bottom <= bounds.bottom
      );
    });
    if (visible) return;
  }
  throw new Error("The end of the diary never became visible");
});

test("save notices can be dismissed and expire on their own", async ({
  page,
}) => {
  await ready(page);
  await page.locator("nav [data-go=diary]").click();
  const text = page.locator("#diary-text");
  const save = page.locator("#diary-form button[type=submit]");
  const notice = page.locator("#toast");
  await text.fill("一つ目の日記");
  await save.click();
  await expect(notice).toBeVisible();
  await notice.locator("[data-toast-close]").click();
  await expect(notice).toBeHidden();
  await text.fill("二つ目の日記");
  await save.click();
  await expect(notice).toBeVisible();
  await expect(notice).toBeHidden({ timeout: 8000 });
});
