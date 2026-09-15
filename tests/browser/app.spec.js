import { test, expect } from "@playwright/test";
const today = () =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
const yesterday = () => {
  const d = new Date(`${today()}T12:00:00+09:00`);
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
};
async function localOnly(page) {
  await page.route("**/firebase-config.js*", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: "window.FIREBASE_CONFIG = {};",
    }),
  );
}
async function start(page, lang = "ja") {
  await localOnly(page);
  await page.goto("/");
  await page.locator("#language").selectOption(lang);
  await page.locator("#nickname").fill("Dreamer");
  await page.locator("#ageGroup").selectOption("20代");
  await page.locator("#profile-form button[type=submit]").click();
  await expect(page.locator('[data-answer="2"]')).toBeVisible();
  for (let i = 0; i < 16; i++) {
    await page.locator(`[data-answer="${i === 11 ? 2 : 0}"]`).click();
    await page.locator('[data-action="quiz-next"]').click();
  }
  await expect(page.locator("[data-action=begin]")).toBeVisible();
  await page.locator("[data-action=begin]").click();
  await expect(page.locator("[data-action=record]")).toBeVisible();
}
for (const [lang, label] of [
  ["ja", "挑戦系"],
  ["ko", "도전형"],
  ["zh", "挑战型"],
  ["en", "The Challenger"],
]) {
  test(`registration, questionnaire, and reload in ${lang}`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await start(page, lang);
    await expect(page.locator("main h2").first()).toHaveText(label);
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
    await expect(page.locator("main")).not.toContainText("undefined");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    if (lang === "ja")
      await page.screenshot({
        path: "test-results/home-mobile-ja.png",
        fullPage: true,
      });
    await page.reload();
    await expect(page.locator("main h2").first()).toHaveText(label);
    expect(errors).toEqual([]);
  });
}
test("diary context, sleep growth, persisted history, image, delete, and backup", async ({
  page,
}) => {
  await start(page, "en");
  await page.locator("nav [data-go=diary]").click();
  await page.locator("#diary-date").fill(yesterday());
  await page.locator("#diary-date").dispatchEvent("change");
  await page.locator("#diary-text").fill("Yesterday I worked on a challenge.");
  await page.locator("#diary-form button[type=submit]").click();
  await expect(page.locator("main")).toContainText("Yesterday I worked");
  await page.locator("nav [data-go=record]").click();
  await page
    .locator("#dream-text")
    .fill("I faced a challenge and climbed a mountain.");
  await page.locator("#include-sleep").check();
  await page.locator("#hours").fill("8");
  await page.locator("#awakenings").fill("0");
  await page.locator("#rested").selectOption("5");
  await page.locator("#dream-form button[type=submit]").click();
  await expect(page.locator("main")).toContainText(
    "Yesterday I worked on a challenge.",
  );
  await expect(page.locator("main")).toContainText("Sleep level: 5 / 5");
  await page.locator("nav [data-go=home]").click();
  await expect(page.locator(".score")).toContainText("5");
  await page.reload();
  await expect(page.locator(".score")).toContainText("5");
  await page.locator("nav [data-go=history]").click();
  await page.locator("#search").fill("mountain");
  await expect(page.locator(".entry")).toHaveCount(1);
  await page.locator(".entry").click();
  await page.locator("[data-action=edit]").click();
  await page.locator("summary").filter({ hasText: "handwritten" }).click();
  await page.locator("#photo-file").setInputFiles({
    name: "note.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(page.locator(".photo")).toBeVisible();
  await page.locator("#dream-form button[type=submit]").click();
  await expect(page.locator(".photo")).toBeVisible();
  await page.locator("nav [data-go=settings]").click();
  const download = page.waitForEvent("download");
  await page.locator("[data-action=export]").click();
  expect((await download).suggestedFilename()).toMatch(/yumetan-.*json/);
  await page.locator("#alarm-time").fill("06:30");
  await page.locator("#alarm-form button").click();
  await expect(page.locator("#alarm-status")).toContainText("will not ring");
  await page.locator("nav [data-go=history]").click();
  await page.locator("#history-filter").selectOption("dream");
  await page.locator(".entry").click();
  page.once("dialog", (d) => d.accept());
  await page.locator("[data-action=delete]").click();
  await expect(page.locator(".entry")).toHaveCount(1);
});
test("partial questionnaire survives refresh and back navigation", async ({
  page,
}) => {
  await localOnly(page);
  await page.goto("/");
  await page.locator("#nickname").fill("Test");
  await page.locator("#profile-form button").click();
  await page.locator('[data-answer="1"]').click();
  await page.locator("[data-action=quiz-next]").click();
  await page.reload();
  await expect(page.locator("progress")).toHaveAttribute("value", "2");
  await page.locator("[data-action=quiz-back]").click();
  await expect(page.locator('[data-answer="1"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
test("AI failures retain unsaved dream; malformed imports do not alter records", async ({
  page,
}) => {
  await start(page, "en");
  await page.locator("nav [data-go=settings]").click();
  await page.locator("#engine").check();
  await page.locator("#settings-form button[type=submit]").click();
  await page.route("**/api/reflect", (r) =>
    r.fulfill({ status: 503, body: "{}" }),
  );
  await page.locator("nav [data-go=record]").click();
  await page.locator("#dream-text").fill("Do not lose this dream");
  await page.locator("[data-action=analyze]").click();
  await expect(page.locator("#dream-text")).toHaveValue(
    "Do not lose this dream",
  );
  await expect(page.locator("#toast")).toContainText("preserved");
  page.once("dialog", (d) => d.accept());
  await page.locator("nav [data-go=settings]").click();
  await page.locator("#import-file").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"dreams":[{}]}'),
  });
  await expect(page.locator("#toast")).toContainText("Could not import");
});
test.describe("offline cache", () => {
  test.use({ serviceWorkers: "allow" });
  test("desktop layout and offline reload use cached module graph", async ({
    page,
    context,
  }) => {
    await context.route(
      /https:\/\/(www\.gstatic\.com|[^/]*googleapis\.com|[^/]*firebaseio\.com)\//,
      (route) => route.abort(),
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await start(page, "en");
    await page.screenshot({
      path: "test-results/home-desktop.png",
      fullPage: true,
    });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator("[data-action=record]")).toBeVisible();
    await page.locator("nav [data-go=record]").click();
    await page.locator("#dream-text").fill("An offline dream");
    await page.locator("#dream-form button[type=submit]").click();
    await expect(page.locator("main")).toContainText("An offline dream");
    await context.setOffline(false);
  });
});

test("storage failure preserves draft and never reports success", async ({
  page,
}) => {
  await start(page, "en");
  await page.locator("nav [data-go=record]").click();
  await page.locator("#dream-text").fill("Keep this when disk is full");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("yumetan.v4."))
        throw new DOMException("Full", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.locator("#dream-form button[type=submit]").click();
  await expect(page.locator("#toast")).toHaveText(
    "Could not save. Check available device storage.",
  );
  await expect(page.locator("#dream-text")).toHaveValue(
    "Keep this when disk is full",
  );
});

test("AI reflection and OCR preserve language and require review before saving", async ({
  page,
}) => {
  await start(page, "en");
  await page.locator("nav [data-go=settings]").click();
  await page.locator("#engine").check();
  await page.locator("#settings-form button[type=submit]").click();
  let reflectionRequest;
  await page.route("**/api/reflect", async (route) => {
    reflectionRequest = route.request().postDataJSON();
    await route.fulfill({
      json: {
        analysis: {
          title: "A challenge",
          summary: "Dream summary",
          reply: "A gentle reflection.",
          mental_state_hint: "A possible association.",
        },
      },
    });
  });
  await page.route("**/api/handwriting", (route) =>
    route.fulfill({ json: { text: "Recognized notebook text [?]" } }),
  );
  await page.locator("nav [data-go=record]").click();
  await page.locator("#dream-text").fill("My challenge");
  await page.locator("summary").filter({ hasText: "handwritten" }).click();
  await page.locator("#photo-file").setInputFiles({
    name: "note.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page.locator("[data-action=recognize]").click();
  await expect(page.locator("#dream-text")).toHaveValue(
    "My challenge\nRecognized notebook text [?]",
  );
  await expect(page.locator("#toast")).toContainText("Review and correct");
  await page.locator("[data-action=analyze]").click();
  await expect(page.locator("main")).toContainText("A gentle reflection.");
  expect(reflectionRequest.language).toBe("en");
  expect(reflectionRequest.typeTags).toContain("challenge");
  await page.locator("#language").selectOption("ko");
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  await expect(page.locator("#dream-text")).toHaveValue(
    "My challenge\nRecognized notebook text [?]",
  );
});

test("account switching isolates journals and reload restores the active scope", async ({
  page,
}) => {
  await page.route("**/firebase-config.js*", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: "window.FIREBASE_CONFIG = {};",
    }),
  );
  await page.route("**/cloud.js*", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `
 const blank={nickname:'Second account',ageGroup:'20代',language:'en',typeAnswers:Array(16).fill(0)};
 let uid=localStorage.getItem('test.uid')||'first';
 const get=()=>JSON.parse(localStorage.getItem('test.db.'+uid)||'{"records":[],"profile":null}');
 const set=value=>localStorage.setItem('test.db.'+uid,JSON.stringify(value));
 window.YumetanCloud={state:{enabled:true},ready:Promise.resolve({enabled:true}),uid:()=>uid,isAnonymous:()=>false,email:()=>uid+'@example.test',loadOnce:async()=>get().records,loadProfile:async()=>uid==='second'?blank:get().profile,saveProfile:async profile=>set({...get(),profile}),saveDream:async record=>set({...get(),records:[...get().records.filter(r=>r.id!==record.id),record]}),deleteDream:async id=>set({...get(),records:get().records.filter(r=>r.id!==id)}),signOut:async()=>{uid='second';localStorage.setItem('test.uid',uid);}};
 `,
    }),
  );
  await page.goto("/");
  await page.locator("#language").selectOption("en");
  await page.locator("#nickname").fill("First account");
  await page.locator("#profile-form button").click();
  for (let i = 0; i < 16; i++) {
    await page.locator('[data-answer="0"]').click();
    await page.locator("[data-action=quiz-next]").click();
  }
  await page.locator("[data-action=begin]").click();
  await page.locator("nav [data-go=record]").click();
  await page.locator("#dream-text").fill("Private dream of first account");
  await page.locator("#dream-form button[type=submit]").click();
  await page.locator("nav [data-go=settings]").click();
  await page.locator("[data-action=signout]").click();
  await page.locator("nav [data-go=history]").click();
  await expect(page.locator(".entry")).toHaveCount(0);
  await page.reload();
  await page.locator("nav [data-go=history]").click();
  await expect(page.locator(".entry")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(
    "Private dream of first account",
  );
});

test("HTTP rejects malformed AI requests and exposes only configuration status", async ({
  request,
}) => {
  const health = await request.get("/api/health");
  expect(health.ok()).toBeTruthy();
  const body = await health.json();
  expect(typeof body.aiConfigured).toBe("boolean");
  expect(body).not.toHaveProperty("apiKey");
  const invalid = await request.post("/api/reflect", {
    data: {
      language: "en",
      date: today(),
      text: "hello",
      diary: { date: today(), text: "wrong day" },
    },
  });
  expect(invalid.status()).toBe(400);
  const image = await request.post("/api/handwriting", {
    data: { language: "en", image: "data:text/html;base64,AAAA" },
  });
  expect(image.status()).toBe(400);
});
