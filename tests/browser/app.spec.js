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
// A signed-in Starter member: the server-verified plan unlocks AI readings and
// the human character collection. No real Firebase or OpenAI traffic occurs.
async function paidMember(page, plan = "starter") {
  await localOnly(page);
  await page.route("**/cloud.js*", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `
 const get=()=>JSON.parse(localStorage.getItem('test.db.member')||'{"records":[],"profile":null}');
 const set=value=>localStorage.setItem('test.db.member',JSON.stringify(value));
 window.YumetanCloud={state:{enabled:true},ready:Promise.resolve({enabled:true}),uid:()=>'member',isAnonymous:()=>false,email:()=>'member@example.test',idToken:async()=>'test-token',loadOnce:async()=>get().records,loadProfile:async()=>get().profile,saveProfile:async profile=>set({...get(),profile}),saveDream:async record=>set({...get(),records:[...get().records.filter(r=>r.id!==record.id),record]}),deleteDream:async id=>set({...get(),records:get().records.filter(r=>r.id!==id)}),signOut:async()=>{}};
 `,
    }),
  );
  await page.route("**/api/account", (route) =>
    route.fulfill({
      json: {
        plan,
        paidUntil: Date.now() + 86400000 * 30,
        usage: { day: {}, month: {} },
      },
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
    { ja: "キロ", ko: "키로", zh: "奇洛", en: "Kiro" }[lang],
  );
  await expect(page.locator(".character-art")).toHaveAttribute(
    "src",
    /moonkeepers-v1\/challenge\.webp$/,
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
      { ja: "キロ", ko: "키로", zh: "奇洛", en: "Kiro" }[lang],
    );
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
    // Icon-only floating tab bar with the settings button in the header.
    await expect(page.locator("nav button")).toHaveCount(4);
    await expect(page.locator("nav button")).toHaveText(["", "", "", ""]);
    await expect(page.locator("#header [data-go=settings]")).toBeVisible();
    await expect(page.locator("#header #language")).toHaveCount(0);
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
      { ja: "キロ", ko: "키로", zh: "奇洛", en: "Kiro" }[lang],
    );
    expect(errors).toEqual([]);
  });
}
test("diary context, sleep growth, date-based journals, image, and delete", async ({
  page,
}) => {
  await start(page, "en");
  await page.locator("nav [data-go=diary]").click();
  await page.locator("#diary-date").fill(yesterday());
  await page.locator("#diary-date").dispatchEvent("change");
  await page.locator("#diary-text").fill("Yesterday I worked on a challenge.");
  await page.locator("#diary-form button[type=submit]").click();
  await expect(page.locator("#toast")).toContainText("Saved");
  // Saving keeps the diary page open on that date; moving a day and back reloads it.
  await expect(page.locator("#diary-text")).toHaveValue(
    "Yesterday I worked on a challenge.",
  );
  await expect(page.locator("[data-action=delete-entry]")).toBeVisible();
  await page.locator("[data-shift='1']").click();
  await expect(page.locator("#diary-date")).toHaveValue(today());
  await expect(page.locator("#diary-text")).toHaveValue("");
  await page.locator("[data-shift='-1']").click();
  await expect(page.locator("#diary-text")).toHaveValue(
    "Yesterday I worked on a challenge.",
  );
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
  // Sleep is never graded: the level comes from the number of logged dreams.
  await expect(page.locator("main")).not.toContainText("Sleep level");
  // The entry page has a "← previous page" link; the edge swipe does the same.
  await expect(page.locator(".back-link")).toHaveText("← Dream journal");
  await page.locator(".back-link").click();
  await expect(page.locator("#dream-text")).toHaveValue(
    "I faced a challenge and climbed a mountain.",
  );
  await page.locator("nav [data-go=home]").click();
  await expect(page.locator(".score")).toContainText("Lv.1");
  await expect(page.locator(".level-next")).toContainText("2 more to Lv.2");
  await expect(page.locator(".level-next")).toContainText("Dreams logged: 1");
  await expect(
    page.locator(".character-row .character-stars .lit"),
  ).toHaveCount(1);
  await expect(page.locator(".back-link")).toHaveCount(0);
  await page.locator(".character-row .character-link").first().click();
  await expect(page.locator("h1")).toHaveText("Kiro");
  await expect(page.locator(".back-link")).toHaveText("← Home");
  await page.locator(".back-link").click();
  await expect(page.locator("[data-action=catalog]")).toBeVisible();
  await page.reload();
  await expect(page.locator(".score")).toContainText("Lv.1");
  // The dream page opens today's saved dream directly; the recent list also finds it.
  await page.locator("nav [data-go=record]").click();
  await expect(page.locator("#dream-text")).toHaveValue(
    "I faced a challenge and climbed a mountain.",
  );
  await expect(page.locator(".recent-entries [data-open-entry]")).toHaveCount(
    1,
  );
  await expect(page.locator(".recent-entries")).toContainText("mountain");
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
  await page.locator("#header [data-go=settings]").click();
  // Developer-only sections (AI server, backup) and the alarm are gone from Settings.
  await expect(page.locator("#settings-form, #import-file")).toHaveCount(0);
  await expect(page.locator("[data-action=export]")).toHaveCount(0);
  await expect(page.locator("#alarm-form")).toHaveCount(0);
  await expect(page.locator(".back-link")).toHaveCount(0);
  await page.locator("nav [data-go=record]").click();
  await expect(page.locator("#dream-text")).toHaveValue(
    "I faced a challenge and climbed a mountain.",
  );
  page.once("dialog", (d) => d.accept());
  await page.locator("[data-action=delete-entry]").click();
  await expect(page.locator("#dream-text")).toHaveValue("");
  await expect(page.locator(".recent-entries [data-open-entry]")).toHaveCount(
    0,
  );
  await page.locator("nav [data-go=diary]").click();
  await expect(page.locator(".recent-entries [data-open-entry]")).toHaveCount(
    1,
  );
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
test("AI failures retain the unsaved dream; free members get a local reflection and an upgrade hint", async ({
  page,
}) => {
  await paidMember(page);
  await start(page, "en");
  await page.route("**/api/reflect", (r) =>
    r.fulfill({ status: 503, body: "{}" }),
  );
  await page.locator("nav [data-go=record]").click();
  await expect(page.locator("[data-action=analyze]")).toHaveText(
    "Read with AI",
  );
  await page.locator("#dream-text").fill("Do not lose this dream");
  await page.locator("[data-action=analyze]").click();
  await expect(page.locator("#dream-text")).toHaveValue(
    "Do not lose this dream",
  );
  await expect(page.locator("#toast")).toContainText("preserved");
});
test("free members never call GPT: reflection stays local with an upgrade hint", async ({
  page,
}) => {
  await start(page, "en");
  let calls = 0;
  await page.route("**/api/reflect", (r) => {
    calls++;
    return r.fulfill({ status: 403, json: { code: "paidRequired" } });
  });
  await page.locator("nav [data-go=record]").click();
  await expect(page.locator("[data-action=analyze]")).toHaveText("Reflect");
  await page.locator("#dream-text").fill("A challenge on a mountain");
  await page.locator("[data-action=analyze]").click();
  await expect(page.locator(".reading-card")).toContainText(
    "These themes appear in your dream",
  );
  await expect(page.locator(".reading-upsell")).toContainText("Sign in");
  expect(calls).toBe(0);
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
    await page.locator("#header [data-go=settings]").click();
    // Free plan: animals are the only selectable collection while offline too.
    await expect(
      page.locator("#character-form input[value=human]"),
    ).toBeDisabled();
    await expect(
      page.locator("#character-form input[value=animal]"),
    ).toBeChecked();
    await page.reload();
    await page.locator("[data-action=catalog]").click();
    await expect(
      page.locator(".catalog-character .character-name").first(),
    ).toHaveText("Luno");
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

test("AI reading shows state of mind and fortune, sends recent diaries, and OCR requires review", async ({
  page,
}) => {
  await paidMember(page);
  await start(page, "en");
  await page.locator("nav [data-go=diary]").click();
  await page.locator("#diary-date").fill(yesterday());
  await page.locator("#diary-date").dispatchEvent("change");
  await page.locator("#diary-text").fill("A busy day before the dream.");
  await page.locator("#diary-form button[type=submit]").click();
  await expect(page.locator("#toast")).toContainText("Saved");
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
          mood_weather: "partly_cloudy",
          mood_label: "Quietly hopeful",
          mental_state: "The climb suggests steady focus.",
          fortune_overview: "A day for small wins.",
          fortune_mood: "Calm with a spark of curiosity.",
          lucky_hint: "Lucky color: sky blue.",
          advice: "Finish one small task early.",
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
  await expect(page.locator(".reading-card")).toContainText("Quietly hopeful");
  await expect(page.locator(".reading-card")).toContainText("Partly cloudy");
  await expect(page.locator(".reading-card")).toContainText(
    "A day for small wins.",
  );
  await expect(page.locator(".reading-card")).toContainText(
    "Lucky color: sky blue.",
  );
  await expect(page.locator(".reading-card")).toContainText("not a medical");
  expect(reflectionRequest.language).toBe("en");
  expect(reflectionRequest.recentDiaries).toEqual([
    { date: yesterday(), text: "A busy day before the dream." },
  ]);
  expect(reflectionRequest.diary.text).toBe("A busy day before the dream.");
  expect(reflectionRequest.dreamType).toBe("challenge");
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    "sk-test-fixture",
  );
  expect(reflectionRequest.typeTags).toContain("challenge");
  // The reading is stored with the dream and survives reload.
  await page.locator("#dream-form button[type=submit]").click();
  await expect(page.locator(".reading-card")).toContainText("Quietly hopeful");
  await page.reload();
  await page.locator("nav [data-go=record]").click();
  await expect(page.locator(".reading-card")).toContainText(
    "A day for small wins.",
  );
  await page.locator("#header [data-go=settings]").click();
  await page.locator("#language").selectOption("ko");
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
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
  await page.locator("#header [data-go=settings]").click();
  await page.locator("[data-action=signout]").click();
  await page.locator("nav [data-go=record]").click();
  await expect(page.locator("#dream-text")).toHaveValue("");
  await expect(page.locator(".recent-entries [data-open-entry]")).toHaveCount(
    0,
  );
  await page.reload();
  await page.locator("nav [data-go=record]").click();
  await expect(page.locator(".recent-entries [data-open-entry]")).toHaveCount(
    0,
  );
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
    "Kiro",
  );
  await expect(page.locator(".character-row")).toContainText("The Challenger");
  await page.locator("nav [data-go=record]").click();
  await expect(page.locator("#dream-text")).toHaveValue("A dream from main");
  await expect(page.locator("main")).toContainText("Previous diary from main");
  await page.locator("nav [data-go=diary]").click();
  await expect(page.locator(".recent-entries [data-open-entry]")).toHaveCount(
    1,
  );
});

test("all sixteen illustrations and localized stories render without overflow", async ({
  page,
}) => {
  await start(page, "ja");
  await page.locator("[data-action=catalog]").click();
  await expect(page.locator(".catalog-character")).toHaveCount(16);
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
    ["ja", "ルノ", "ココ"],
    ["ko", "루노", "코코"],
    ["zh", "露诺", "可可"],
    ["en", "Luno", "Coco"],
  ]) {
    await page.locator("#header [data-go=settings]").click();
    await page.locator("#language").selectOption(lang);
    await page.locator("nav [data-go=home]").click();
    await page.locator("[data-action=catalog]").click();
    await expect(
      page.locator(".catalog-character .character-name").first(),
    ).toHaveText(first);
    await expect(
      page.locator(".catalog-character .character-name").last(),
    ).toHaveText(last);
    await page.locator("[data-type-detail]").first().click();
    await expect(page.locator(".character-story").first()).toBeVisible();
    await page.locator(".back-link").click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.locator("#header [data-go=settings]").click();
  await page.locator("#language").selectOption("ja");
  await page.locator("nav [data-go=home]").click();
  await page.locator("[data-action=catalog]").click();
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

test("missing artwork preserves identity and a fresh journal starts at one star", async ({
  page,
}) => {
  await page.route("**/challenge.webp", (route) => route.abort());
  await start(page, "en");
  await expect(
    page.locator(".character-row .character-fallback"),
  ).toBeVisible();
  await expect(page.locator(".character-row .character-name")).toHaveText(
    "Kiro",
  );
  await expect(
    page.locator(".character-row .character-stars .lit"),
  ).toHaveCount(1);
});

test("paid members switch collections both ways without changing journals, type or sleep", async ({
  page,
}) => {
  await paidMember(page);
  await start(page, "en");
  await page.locator("nav [data-go=record]").click();
  await page.locator("#dream-text").fill("A challenge in the mountains");
  await page.locator("#include-sleep").check();
  await page.locator("#hours").fill("8");
  await page.locator("#awakenings").fill("0");
  await page.locator("#rested").selectOption("5");
  await page.locator("#dream-form button[type=submit]").click();
  const saved = await page.evaluate(() =>
    localStorage.getItem("yumetan.v4.member"),
  );
  for (const [set, hero, first, last] of [
    ["human", "Kakeru", "Ren", "Kanata"],
    ["animal", "Kiro", "Luno", "Coco"],
  ]) {
    await page.locator("#header [data-go=settings]").click();
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
    await expect(page.locator(".score")).toContainText("Lv.1");
    await expect(
      page.locator(".character-row .character-stars .lit"),
    ).toHaveCount(1);
    const current = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("yumetan.v4.member")),
    );
    const before = JSON.parse(saved);
    expect(current.records).toEqual(before.records);
    expect(current.deleted).toEqual(before.deleted);
    expect(current.profile.typeAnswers).toEqual(before.profile.typeAnswers);
    expect(current.profile.characterSet).toBe(set);
    await page.locator("[data-action=catalog]").click();
    await expect(
      page.locator(".catalog-character .character-name").first(),
    ).toHaveText(first);
    await expect(
      page.locator(".catalog-character .character-name").last(),
    ).toHaveText(last);
    await expect(page.locator(".catalog-character")).toHaveCount(16);
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

test("failed appearance saves do not switch the active collection", async ({
  page,
}) => {
  await paidMember(page);
  await start(page, "en");
  await page.locator("#header [data-go=settings]").click();
  await page.locator("#character-form input[value=human]").check();
  await page.locator("#character-form button[type=submit]").click();
  await expect(page.locator("#toast")).toContainText("Saved");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "yumetan.v4.options") throw new Error("disk full");
      return original.call(this, key, value);
    };
  });
  await page.locator("#character-form input[value=animal]").check();
  await page.locator("#character-form button[type=submit]").click();
  await expect(page.locator("#toast")).not.toHaveText("Saved");
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("nav [data-go=home]").click();
  await expect(page.locator(".character-row .character-name")).toHaveText(
    "Kakeru",
  );
});
test("the floating tab bar switches pages by dragging the highlight", async ({
  page,
}) => {
  await start(page, "en");
  await page.locator("nav [data-go=diary]").click();
  await expect(page.locator("#diary-text")).toBeVisible();
  const track = await page.locator("nav .nav-track").boundingBox();
  const y = track.y + track.height / 2;
  await page.mouse.move(track.x + track.width * 0.62, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++)
    await page.mouse.move(track.x + track.width * (0.62 - 0.05 * i), y);
  await page.mouse.up();
  await expect(page.locator("[data-action=catalog]")).toBeVisible();
  await expect(page.locator("nav [data-go=home]")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.mouse.move(track.x + track.width * 0.12, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++)
    await page.mouse.move(track.x + track.width * (0.12 + 0.04 * i), y);
  await page.mouse.up();
  await expect(page.locator("#dream-text")).toBeVisible();
});

test("the dream level climbs with logged dreams and swiping in from the left edge goes back", async ({
  page,
}) => {
  await paidMember(page);
  await start(page, "en");
  for (let i = 0; i < 3; i++) {
    await page.locator("nav [data-go=record]").click();
    if (i) await page.locator("[data-action=new-dream]").click();
    await page.locator("#dream-text").fill(`Dream number ${i + 1}`);
    await page.locator("#dream-form button[type=submit]").click();
    await expect(page.locator("main")).toContainText(`Dream number ${i + 1}`);
  }
  await expect(page.locator("#toast")).toContainText("level went up");
  await page.locator("nav [data-go=home]").click();
  await expect(page.locator(".score")).toContainText("Lv.2");
  await expect(page.locator(".level-next")).toContainText("4 more to Lv.3");
  await expect(page.locator(".level-gauge")).toHaveAttribute(
    "aria-valuenow",
    "0",
  );
  await page.locator("[data-action=catalog]").click();
  await page.locator("[data-type-detail=chase]").click();
  await expect(page.locator(".back-link")).toHaveText("← Explore all 16");
  await page.mouse.move(8, 400);
  await page.mouse.down();
  for (let x = 20; x <= 140; x += 20) await page.mouse.move(x, 402);
  await page.mouse.up();
  await expect(page.locator("[data-type-detail]")).toHaveCount(16);
  await expect(page.locator(".back-link")).toHaveText("← Home");
  await page.goBack();
  await expect(page.locator("[data-action=catalog]")).toBeVisible();
});
