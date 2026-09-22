import { test, expect } from "@playwright/test";
import { chooseDate, savedDreamDetails } from "./helpers/journal.js";
const today = new Date().toLocaleDateString("sv-SE", {
  timeZone: "Asia/Tokyo",
});
async function ready(page, records = [], language = "ja") {
  await page.route("**/firebase-config.js*", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body: "window.FIREBASE_CONFIG={};",
    }),
  );
  await page.addInitScript(
    ({ records, language }) => {
      if (localStorage.getItem("yumetan.v4.local")) return;
      localStorage.setItem("yumetan.v4.options", JSON.stringify({ language }));
      localStorage.setItem(
        "yumetan.v4.local",
        JSON.stringify({
          version: 4,
          profile: {
            nickname: "ゆめ",
            language,
            ageGroup: "20代",
            typeAnswers: Array.from({ length: 16 }, (_, i) =>
              i === 11 ? 2 : 0,
            ),
            updatedAt: new Date().toISOString(),
          },
          records,
          deleted: [],
        }),
      );
    },
    { records, language },
  );
  await page.goto("/");
  await expect(page.locator("[data-action=catalog]")).toBeVisible();
}
const record = (kind, date, text) => ({
  id: kind + date,
  kind,
  date,
  text,
  typeTags: [],
  sleep: null,
  photo: null,
  createdAt: date + "T12:00:00Z",
  updatedAt: date + "T12:00:00Z",
});
test("saved dream clears all draft fields only after successful persistence", async ({
  page,
}) => {
  await ready(page);
  await page.locator("nav [data-go=record]").click();
  await chooseDate(page, "dream-date", "2024-02-29");
  await page.locator("#dream-text").fill("うるう日の夢");
  await page.locator("#include-sleep").check();
  await page.locator("#hours").fill("8");
  await page.locator("#awakenings").fill("0");
  await page.locator("#rested").selectOption("4");
  await page.locator("#dream-form button[type=submit]").click();
  await expect(page.locator("#dream-text")).toHaveValue("");
  await expect(page.locator("#dream-date")).toHaveValue(today);
  await expect(page.locator("#include-sleep")).not.toBeChecked();
  await expect(page.locator(".reading-card")).toHaveCount(0);
  await savedDreamDetails(page);
  await expect(page.locator("main")).toContainText("うるう日の夢");
  await page.locator("nav [data-go=record]").click();
  await page.locator("#dream-text").fill("今日の新しい夢");
  await page.locator("#dream-form button[type=submit]").click();
  const records = await page.evaluate(
    () => JSON.parse(localStorage.getItem("yumetan.v4.local")).records,
  );
  expect(records).toHaveLength(2);
  expect(new Set(records.map((r) => r.id)).size).toBe(2);
});
test("custom calendar and discard dialog preserve diary edits on cancel and handle leap days", async ({
  page,
}) => {
  await ready(page, [record("diary", "2024-02-29", "保存済みの日記")]);
  page.on("dialog", () => {
    throw new Error("Native dialog must not be used");
  });
  await page.locator("nav [data-go=diary]").click();
  await chooseDate(page, "diary-date", "2024-02-29");
  await expect(page.locator("#diary-text")).toHaveValue("保存済みの日記");
  await page.locator("#diary-text").fill("編集を残しておく");
  await page.locator('[data-shift="1"]').click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator("[data-dialog-cancel]")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#diary-date")).toHaveValue("2024-02-29");
  await expect(page.locator("#diary-text")).toHaveValue("編集を残しておく");
  await page.locator('[data-shift="1"]').click();
  await page.locator("[data-dialog-discard]").click();
  await expect(page.locator("#diary-date")).toHaveValue("2024-03-01");
  await expect(page.locator("#diary-text")).toHaveValue("");
  await page.locator("[data-date-field=diary-date]").click();
  await page.locator('[data-calendar-date="2024-03-01"]').press("ArrowLeft");
  await expect(page.locator('[data-calendar-date="2024-02-29"]')).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#diary-text")).toHaveValue("保存済みの日記");
  await page.locator("[data-date-field=diary-date]").click();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-date-field=diary-date]")).toBeFocused();
  await expect(page.locator("input[type=date]")).toHaveCount(0);
});
test("recent dream and diary screens show only the selected day and preserve date on back", async ({
  page,
}) => {
  await ready(page, [
    record("dream", "2024-02-29", "夢の本文"),
    record("dream", "2024-03-01", "翌日の夢"),
    record("diary", "2024-02-29", "日記の本文"),
  ]);
  await page.locator("nav [data-go=record]").click();
  await page.locator("[data-open-days=dream]").click();
  await expect(page.locator(".day-records")).toContainText("翌日の夢");
  await page.locator('[data-day-step="-1"]').click();
  await expect(page.locator(".day-records")).toContainText("夢の本文");
  await expect(page.locator(".day-records")).not.toContainText("日記の本文");
  await page.locator("[data-entry]").click();
  await page.locator(".back-link").click();
  await expect(page.locator(".day-records")).toContainText("夢の本文");
  await page.locator('[data-day-step="-1"]').click();
  await expect(page.locator(".day-record")).toHaveCount(0);
  await page.locator("[data-journal-calendar]").click();
  await page.locator("[data-calendar-today]").click();
  await expect(page.locator('[data-day-step="1"]')).toBeDisabled();
  await page.locator("[data-journal-calendar]").click();
  await expect(page.locator("[data-calendar-next]")).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.locator("nav [data-go=diary]").click();
  await page.locator("[data-open-days=diary]").click();
  await expect(page.locator(".day-records")).toContainText("日記の本文");
  await expect(page.locator(".day-records")).not.toContainText("夢の本文");
});
test("holding and sliding previews, release confirms; outside release and cancellation stay put", async ({
  page,
}) => {
  await ready(page);
  const a = await page.locator("nav [data-go=home]").boundingBox(),
    b = await page.locator("nav [data-go=diary]").boundingBox();
  const hold = async () => {
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await expect(page.locator("#nav")).toHaveClass(/nav-scrubbing/);
  };
  await hold();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await expect(page.locator("nav [data-go=diary]")).toHaveClass(/nav-preview/);
  await expect(page.locator("#app")).toHaveAttribute("data-page", "home");
  await page.mouse.move(1, 1);
  await page.mouse.up();
  await expect(page.locator("#app")).toHaveAttribute("data-page", "home");
  await hold();
  await page.locator("#nav").dispatchEvent("pointercancel");
  await page.mouse.up();
  await expect(page.locator("#app")).toHaveAttribute("data-page", "home");
  await hold();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator("#app")).toHaveAttribute("data-page", "diary");
  await page.locator("#diary-text").fill("未保存");
  const d = await page.locator("nav [data-go=diary]").boundingBox(),
    h = await page.locator("nav [data-go=home]").boundingBox();
  await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2);
  await page.mouse.down();
  await expect(page.locator("#nav")).toHaveClass(/nav-scrubbing/);
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.mouse.up();
  await page.locator("[data-dialog-cancel]").click();
  await expect(page.locator("#diary-text")).toHaveValue("未保存");
  await page.locator("nav [data-go=record]").focus();
  await page.keyboard.press("Enter");
  await page.locator("[data-dialog-discard]").click();
  await expect(page.locator("#dream-text")).toBeVisible();
});
for (const language of ["ja", "en", "ko", "zh"])
  test(`home fits the viewport and cards in ${language}`, async ({ page }) => {
    await ready(page, [], language);
    for (const [width, height, safe] of [
      [320, 568, 0],
      [375, 667, 0],
      [390, 844, 1],
      [430, 932, 1],
      [768, 1024, 0],
      [844, 390, 0],
      [1024, 768, 0],
      [1440, 900, 0],
    ]) {
      await page.evaluate((safe) => {
        document.documentElement.style.setProperty(
          "--safe-top",
          safe ? "47px" : "0px",
        );
        document.documentElement.style.setProperty(
          "--safe-bottom",
          safe ? "34px" : "0px",
        );
      }, safe);
      await page.setViewportSize({ width, height });
      await expect
        .poll(() =>
          page.evaluate(() => ({
            height: document.documentElement.scrollHeight,
            viewport: innerHeight,
            reflow: document.body.classList.contains("home-reflow"),
          })),
        )
        .toEqual({ height, viewport: height, reflow: false });
      const overflow = await page
        .locator(
          ".home-dashboard button,.home-dashboard p,.home-dashboard h2,.home-dashboard .character-art",
        )
        .evaluateAll((els) =>
          els
            .filter((el) => {
              const r = el.getBoundingClientRect(),
                c = el.closest(".card")?.getBoundingClientRect();
              return (
                r.left < 0 ||
                r.right > innerWidth + 1 ||
                r.bottom >
                  document.querySelector("nav").getBoundingClientRect().top +
                    1 ||
                (c && (r.bottom > c.bottom + 1 || r.top < c.top - 1))
              );
            })
            .map((el) => el.outerHTML),
        );
      expect(overflow, `${width}x${height}`).toEqual([]);
    }
    await expect(page.locator(".home-advice")).toHaveCount(0);
    expect(
      await page
        .locator(".level-card .score b")
        .evaluate((el) => getComputedStyle(el).fontFamily),
    ).toContain("sans-serif");
  });
test("very short screens and enlarged text retain reachable home controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 360 });
  await ready(page);
  await expect(page.locator("body")).toHaveClass(/home-reflow/);
  for (const zoom of ["1", "2"]) {
    await page.evaluate((zoom) => {
      document.documentElement.style.zoom = zoom;
      window.dispatchEvent(new Event("resize"));
    }, zoom);
    await expect(page.locator("body")).toHaveClass(/home-reflow/);
    const box = await page.locator("nav").boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(321);
    expect(box.y + box.height).toBeLessThanOrEqual(361);
    await page.locator("[data-action=catalog]").scrollIntoViewIfNeeded();
    await expect(page.locator("[data-action=catalog]")).toBeInViewport();
  }
});
test("a quick horizontal drag moves the gray thumb continuously and switches only on release", async ({
  page,
}) => {
  await ready(page);
  const home = await page.locator("nav [data-go=home]").boundingBox(),
    diary = await page.locator("nav [data-go=diary]").boundingBox();
  const x = home.x + home.width / 2,
    y = home.y + home.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 15, y);
  await expect(page.locator("#nav")).toHaveClass(/nav-scrubbing/);
  const thumb = page.locator(".nav-indicator");
  await expect
    .poll(async () => (await thumb.boundingBox()).x)
    .toBeGreaterThan(home.x + 10);
  const first = (await thumb.boundingBox()).x;
  await page.mouse.move(x + 30, y);
  await expect
    .poll(async () => (await thumb.boundingBox()).x - first)
    .toBeGreaterThan(10);
  const color = await thumb.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  const [red, green, blue] = color.match(/[\d.]+/g).map(Number);
  expect(red).toBe(green);
  expect(green).toBe(blue);
  await page.mouse.move(diary.x + diary.width / 2, y, { steps: 10 });
  await expect(page.locator("#app")).toHaveAttribute("data-page", "home");
  await page.mouse.up();
  await expect(page.locator("#diary-text")).toBeVisible();
});
test("home devotes more area to writing and level progress and spells out the next level", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  expect(
    (await page.locator(".hero .btn").first().boundingBox()).height,
  ).toBeGreaterThan(75);
  expect(
    (await page.locator(".level-card").boundingBox()).height,
  ).toBeGreaterThan(170);
  expect(
    (await page.locator(".character-row").boundingBox()).height,
  ).toBeLessThan(380);
  await expect(page.locator(".level-next")).toContainText(
    "あと3個の夢を記録するとLv.2になります",
  );
  await expect(page.locator(".dream-count")).toHaveText("記録した夢: 0");
});
