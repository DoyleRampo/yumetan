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
// iOS: opening the keyboard shrinks the visible area and scrolls the page up
// to the field. The page then shrinks to the visible area, so that scroll left
// only empty space on screen. The page returns to the top instead, with the
// nickname field and the button in view.
test("typing the nickname at registration keeps the form on screen above the keyboard", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/firebase-config.js*", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: "window.FIREBASE_CONFIG = {};",
    }),
  );
  await page.addInitScript(() => {
    localStorage.setItem(
      "yumetan.v4.options",
      JSON.stringify({
        language: "ja",
        introduction: { phase: "login", step: 3 },
      }),
    );
    // A stand-in for iOS's visual viewport, which a desktop browser cannot
    // shrink with a keyboard.
    const visual = new EventTarget();
    Object.assign(visual, {
      scale: 1,
      height: innerHeight,
      offsetTop: 0,
      pageTop: 0,
    });
    Object.defineProperty(window, "visualViewport", { value: visual });
    window.__scrolls = [];
    window.scrollTo = (x, y) => {
      window.__scrolls.push([x, y]);
      visual.offsetTop = visual.pageTop = 0;
    };
    window.__keyboard = (open) => {
      visual.height = open ? 460 : innerHeight;
      // iOS's own scroll toward the field, measured on the full-height page.
      visual.offsetTop = visual.pageTop = open ? 220 : 0;
      visual.dispatchEvent(new Event("resize"));
    };
  });
  await page.goto("/");
  await expect(page.locator("#nickname")).toBeVisible();
  await page.locator("#nickname").focus();
  await page.evaluate(() => window.__keyboard(true));
  await page.locator("#nickname").fill("ゆめ");
  // Back at the top, the page as tall as the area above the keyboard.
  expect(await page.evaluate(() => window.__scrolls.at(-1))).toEqual([0, 0]);
  expect(await page.evaluate(() => visualViewport.offsetTop)).toBe(0);
  await expect(page.locator("body")).toHaveClass(/keyboard/);
  await expect
    .poll(() =>
      page.evaluate(() => document.body.getBoundingClientRect().height),
    )
    .toBe(460);
  for (const selector of ["#nickname", "#profile-form button[type=submit]"]) {
    const box = await page.locator(selector).boundingBox();
    expect(box.y, selector).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, selector).toBeLessThanOrEqual(460);
  }
  await expect(page.locator("#header")).toBeInViewport();
  // Closing the keyboard restores the full screen and the picture.
  await page.evaluate(() => window.__keyboard(false));
  await expect(page.locator("body")).not.toHaveClass(/keyboard/);
  await expect(page.locator(".profile-hero")).toBeVisible();
  await expect(page.locator("#nickname")).toHaveValue("ゆめ");
});
