import { test, expect } from "@playwright/test";
import { finishIntroduction } from "./helpers/introduction.js";
import { submitDream } from "./helpers/journal.js";
import { QUESTIONS } from "../../public/core/diagnosis.js";
// GA4 in the app: with a measurement ID the screens and actions land on the
// gtag data layer (the tag script itself is blocked here, so nothing leaves the
// page); without one the app never touches the data layer.
const SHEET = QUESTIONS.map((q) =>
  q.kind === "frequency"
    ? q.group === "lucid"
      ? 4
      : 0
    : q.kind === "scene"
      ? Math.max(
          0,
          q.options.findIndex((o) => o.type === "challenge"),
        )
      : ["motion", "focus"].includes(q.axis)
        ? -2
        : 0,
);
const DREAM = "A secret dream about a lighthouse.";
async function prepare(page, measurementId) {
  await page.route("**/firebase-config.js*", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: "window.FIREBASE_CONFIG = {};",
    }),
  );
  await page.route("**/config.js*", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `window.YUMETAN_CONFIG = { apiBase: "", ga4MeasurementId: ${JSON.stringify(measurementId)} };`,
    }),
  );
  const tagRequests = [];
  await page.route(/googletagmanager\.com/, (route) => {
    tagRequests.push(route.request().url());
    route.abort();
  });
  return tagRequests;
}
const dataLayer = (page) =>
  page.evaluate(() =>
    (window.dataLayer || []).map((entry) => Array.from(entry)),
  );
const eventsOf = (layer) =>
  layer
    .filter((entry) => entry[0] === "event")
    .map(([, name, params]) => ({ name, params }));
async function register(page) {
  await page.goto("/");
  await finishIntroduction(page);
  await page.locator("#language").selectOption("en");
  await page.locator("#nickname").fill("Dreamer");
  await page.locator("#ageGroup").selectOption("20代");
  await page.locator("#profile-form button[type=submit]").click();
  await expect(page.locator('[data-answer="2"]')).toBeVisible();
  for (const value of SHEET) {
    await page.locator(`[data-answer="${value}"]`).click();
    await page.locator('[data-action="quiz-next"]').click();
  }
  await expect(page.locator("[data-action=begin]")).toBeVisible();
  await page.locator("[data-action=begin]").click();
  await expect(page.locator("[data-action=record]")).toBeVisible();
}
test("screens, the tour, the questionnaire and a saved dream reach the data layer without any text", async ({
  page,
}) => {
  const tagRequests = await prepare(page, "G-TEST1234");
  await register(page);
  await page.locator("nav [data-go=record]").click();
  await page.locator("#dream-text").fill(DREAM);
  await submitDream(page);
  await expect(page.locator("#dream-text")).toHaveValue("");
  const layer = await dataLayer(page);
  // The stream was configured once, with the device's client id, and the tag
  // script was requested with the same ID.
  const config = layer.filter((e) => e[0] === "config");
  expect(config).toHaveLength(1);
  expect(config[0][1]).toBe("G-TEST1234");
  expect(config[0][2].client_id).toMatch(/^\d+\.\d+$/);
  expect(config[0][2].send_page_view).toBe(false);
  expect(tagRequests[0]).toBe(
    "https://www.googletagmanager.com/gtag/js?id=G-TEST1234",
  );
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("yumetan.analytics.client")),
    ),
  ).toBe(config[0][2].client_id);
  const events = eventsOf(layer);
  const names = events.map((e) => e.name);
  // One page_view per screen, in the order the person moved.
  const screens = events
    .filter((e) => e.name === "page_view")
    .map((e) => e.params.screen_name);
  expect(screens.slice(0, 2)).toEqual(["intro", "onboard"]);
  expect(screens).toContain("quiz");
  expect(screens).toContain("result");
  expect(screens).toContain("home");
  expect(screens).toContain("reading");
  for (const name of [
    "app_open",
    "tutorial_begin",
    "tutorial_complete",
    "quiz_start",
    "quiz_complete",
    "dream_read",
    "dream_save",
  ])
    expect(names).toContain(name);
  const quiz = events.find((e) => e.name === "quiz_complete");
  expect(quiz.params.dream_type).toBe("challenge");
  const read = events.find((e) => e.name === "dream_read");
  expect(read.params.engine).toBe("local");
  expect(read.params.error_code).toBe("loginRequired");
  expect(read.params.text_length).toBe("31-100");
  const save = events.find((e) => e.name === "dream_save");
  expect(save.params).toMatchObject({
    engine: "local",
    text_length: "31-100",
    has_sleep: 0,
    is_new: 1,
    dreams_total: 1,
    app_platform: "web",
  });
  // Every page_view and event carries the platform; nothing carries the text
  // or the nickname.
  for (const e of events) expect(e.params.app_platform).toBe("web");
  const serialized = JSON.stringify(layer);
  expect(serialized).not.toContain("lighthouse");
  expect(serialized).not.toContain("Dreamer");
  // User properties describe the person coarsely (a guest here).
  const props = layer
    .filter((e) => e[0] === "set" && e[1] === "user_properties")
    .map((e) => e[2]);
  expect(Object.assign({}, ...props)).toMatchObject({
    app_platform: "web",
    plan: "free",
    dream_type: "challenge",
    dream_level: 1,
    language: "en",
    login_provider: "guest",
  });
  // A guest has no user_id; it is set only after a sign-in.
  expect(layer.some((e) => e[0] === "set" && e[1]?.user_id)).toBe(false);
});
test("without a measurement ID the app leaves the data layer alone", async ({
  page,
}) => {
  const tagRequests = await prepare(page, "");
  await page.goto("/");
  await finishIntroduction(page);
  expect(await page.evaluate(() => window.dataLayer)).toBeUndefined();
  expect(await page.evaluate(() => typeof window.gtag)).toBe("undefined");
  expect(tagRequests).toEqual([]);
});
