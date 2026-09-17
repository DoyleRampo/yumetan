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
  await expect(page.locator(".character-name")).toHaveText(
    { ja: "カケル", ko: "카케루", zh: "翔", en: "Kakeru" }[lang],
  );
  await expect(page.locator(".character-art")).toHaveAttribute(
    "src",
    /dreamwalkers-v1\/challenge\.webp$/,
  );
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
    await expect(page.locator(".character-row")).toContainText(label);
    await expect(page.locator(".character-row .character-name")).toHaveText(
      { ja: "カケル", ko: "카케루", zh: "翔", en: "Kakeru" }[lang],
    );
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
    await expect(page.locator(".character-row")).toContainText(label);
    await expect(page.locator(".character-row .character-name")).toHaveText(
      { ja: "カケル", ko: "카케루", zh: "翔", en: "Kakeru" }[lang],
    );
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
  await expect(
    page.locator(".character-row .character-stars .lit"),
  ).toHaveCount(5);
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
    await page.locator("nav [data-go=home]").click();
    await page.locator("[data-action=catalog]").click();
    await expect(page.locator(".character-art")).toHaveCount(16);
    await expect
      .poll(() =>
        page
          .locator(".character-art")
          .evaluateAll((images) =>
            images.every((img) => img.complete && img.naturalWidth > 0),
          ),
      )
      .toBe(true);
    await page.locator("nav [data-go=settings]").click();
    await page.locator("#character-form input[value=animal]").check();
    await page.locator("#character-form button[type=submit]").click();
    await page.reload();
    await page.locator("[data-action=catalog]").click();
    await expect(page.locator(".type-card .character-name").first()).toHaveText(
      "Luno",
    );
    await expect
      .poll(() =>
        page
          .locator(".character-art")
          .evaluateAll((images) =>
            images.every((img) => img.complete && img.naturalWidth > 0),
          ),
      )
      .toBe(true);
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
    expect(route.request().headers()["x-yumetan-key"]).toBeUndefined();
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
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    "sk-test-fixture",
  );
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

test("legacy main v4 profile, diary, and dream migrate without repeating onboarding", async ({
  page,
}) => {
  await localOnly(page);
  await page.addInitScript(
    ({ today, yesterday }) => {
      const types = [
        "chase",
        "loss",
        "bound",
        "collapse",
        "future",
        "intuition",
        "symbol",
        "dejavu",
        "lucid",
        "partial",
        "observer",
        "challenge",
        "place",
        "person",
        "story",
        "emotion",
      ];
      localStorage.setItem(
        "yumetan.settings",
        JSON.stringify({
          lang: "en",
          profile: { nickname: "Existing", ageGroup: "20代" },
          typeState: {
            quiz: types.map((type) => ({
              type,
              value: type === "challenge" ? 2 : 0,
            })),
          },
        }),
      );
      localStorage.setItem(
        "yumetan.diary",
        JSON.stringify([
          {
            id: "legacy-diary",
            date: yesterday,
            text: "Previous diary from main",
            createdAt: yesterday + "T12:00:00Z",
          },
        ]),
      );
      localStorage.setItem(
        "yumetan.dreams",
        JSON.stringify([
          {
            id: "legacy-dream",
            createdAt: today + "T06:00:00Z",
            messages: [{ role: "user", text: "A dream from main" }],
            tags: ["challenge"],
          },
        ]),
      );
    },
    { today: today(), yesterday: yesterday() },
  );
  await page.goto("/");
  await expect(page.locator(".character-row .character-name")).toHaveText(
    "Kakeru",
  );
  await expect(page.locator(".character-row")).toContainText("The Challenger");
  await page.locator("nav [data-go=history]").click();
  await expect(page.locator(".entry")).toHaveCount(2);
  await page.locator(".entry").filter({ hasText: "A dream from main" }).click();
  await page.locator("[data-action=edit]").click();
  await expect(page.locator("main")).toContainText("Previous diary from main");
});

test("iOS notification schedules and cancels without claiming to be a Clock alarm", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.notificationCalls = [];
    window.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => "ios",
      Plugins: {
        LocalNotifications: {
          requestPermissions: async () => ({ display: "granted" }),
          schedule: async (input) => window.notificationCalls.push(input),
          cancel: async (input) =>
            window.notificationCalls.push({ cancel: input }),
        },
      },
    };
  });
  await start(page, "en");
  await page.locator("nav [data-go=settings]").click();
  await page.locator("#alarm-time").fill("06:45");
  await page.locator("[data-action=notify-wake]").click();
  expect(
    await page.evaluate(
      () => window.notificationCalls[0].notifications[0].schedule.on,
    ),
  ).toEqual({ hour: 6, minute: 45 });
  await expect(page.locator("#toast")).toContainText("not a Clock alarm");
  await page.locator("[data-action=cancel-wake]").click();
  expect(
    await page.evaluate(
      () => window.notificationCalls[1].cancel.notifications[0].id,
    ),
  ).toBe(1);
});

test("all sixteen illustrations and localized stories render without overflow", async ({
  page,
}) => {
  await start(page, "ja");
  await page.locator("[data-action=catalog]").click();
  await expect(page.locator(".type-card")).toHaveCount(16);
  await expect
    .poll(() =>
      page
        .locator(".character-art")
        .evaluateAll((images) =>
          images.every((img) => img.complete && img.naturalWidth > 0),
        ),
    )
    .toBe(true);
  expect(
    new Set(
      await page
        .locator(".character-art")
        .evaluateAll((images) => images.map((img) => img.src)),
    ).size,
  ).toBe(16);
  for (const [lang, first, last] of [
    ["ja", "レン", "カナタ"],
    ["ko", "렌", "카나타"],
    ["zh", "莲", "彼方"],
    ["en", "Ren", "Kanata"],
  ]) {
    await page.locator("#language").selectOption(lang);
    await expect(page.locator(".type-card .character-name").first()).toHaveText(
      first,
    );
    await expect(page.locator(".type-card .character-name").last()).toHaveText(
      last,
    );
    await page.locator(".character-details summary").first().click();
    await expect(page.locator(".character-story").first()).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.locator("#language").selectOption("ja");
  await page.screenshot({
    path: "test-results/characters-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/characters-desktop.png",
    fullPage: true,
  });
});

test("missing artwork preserves identity and unmeasured sleep shows no level stars", async ({
  page,
}) => {
  await page.route("**/challenge.webp", (route) => route.abort());
  await start(page, "en");
  await expect(
    page.locator(".character-row .character-fallback"),
  ).toBeVisible();
  await expect(page.locator(".character-row .character-name")).toHaveText(
    "Kakeru",
  );
  await expect(page.locator(".character-stars")).toHaveCount(0);
});

test("character collections switch both ways without changing journals, type or sleep", async ({
  page,
}) => {
  await start(page, "en");
  await page.locator("nav [data-go=record]").click();
  await page.locator("#dream-text").fill("A challenge in the mountains");
  await page.locator("#include-sleep").check();
  await page.locator("#hours").fill("8");
  await page.locator("#awakenings").fill("0");
  await page.locator("#rested").selectOption("5");
  await page.locator("#dream-form button[type=submit]").click();
  const saved = await page.evaluate(() =>
    localStorage.getItem("yumetan.v4.local"),
  );
  for (const [set, hero, first, last] of [
    ["animal", "Kiro", "Luno", "Coco"],
    ["human", "Kakeru", "Ren", "Kanata"],
  ]) {
    await page.locator("nav [data-go=settings]").click();
    await page.locator("#character-form input[value=" + set + "]").check();
    await page.locator("#character-form button[type=submit]").click();
    await expect(page.locator("#toast")).toContainText("Saved");
    await page.reload();
    await expect(page.locator(".character-row .character-name")).toHaveText(
      hero,
    );
    await expect(page.locator(".character-row")).toContainText(
      "The Challenger",
    );
    await expect(page.locator(".score")).toContainText("5");
    await expect(
      page.locator(".character-row .character-stars .lit"),
    ).toHaveCount(5);
    expect(
      await page.evaluate(() => localStorage.getItem("yumetan.v4.local")),
    ).toBe(saved);
    await page.locator("[data-action=catalog]").click();
    await expect(page.locator(".type-card .character-name").first()).toHaveText(
      first,
    );
    await expect(page.locator(".type-card .character-name").last()).toHaveText(
      last,
    );
    await expect(page.locator(".type-card")).toHaveCount(16);
    await expect
      .poll(() =>
        page
          .locator(".character-art")
          .evaluateAll((imgs) =>
            imgs.every((img) => img.complete && img.naturalWidth > 0),
          ),
      )
      .toBe(true);
  }
});

test("appearance save preserves other settings drafts and failed saves do not switch the active collection", async ({
  page,
}) => {
  await start(page, "en");
  await page.locator("nav [data-go=settings]").click();
  await page.locator("#api-url").fill("https://api.example.test");
  await page.locator("#character-form input[value=animal]").check();
  await page.locator("#character-form button[type=submit]").click();
  await expect(page.locator("#api-url")).toHaveValue("https://api.example.test");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator("nav [data-go=home]").click();
  await expect(page.locator("#api-url")).toBeVisible();
  await page.locator("#settings-form button[type=submit]").click();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "yumetan.v4.options") throw new Error("disk full");
      return original.call(this, key, value);
    };
  });
  await page.locator("#character-form input[value=human]").check();
  await page.locator("#character-form button[type=submit]").click();
  await expect(page.locator("#toast")).not.toHaveText("Saved");
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("nav [data-go=home]").click();
  await expect(page.locator(".character-row .character-name")).toHaveText(
    "Kiro",
  );
});
