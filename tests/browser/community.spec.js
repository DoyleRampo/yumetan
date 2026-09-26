import { finishIntroduction } from "./helpers/introduction.js";
import {
  chooseDate,
  savedDreamDetails,
  submitDream,
} from "./helpers/journal.js";
import { test, expect } from "@playwright/test";
import { QUESTIONS } from "../../public/core/diagnosis.js";
import { MemoryStore } from "../helpers/memory-store.mjs";
import { createAccess } from "../../server/access.js";
import { registerCommunity } from "../../server/community.js";
import { createBilling } from "../../server/billing.js";
async function local(page) {
  await page.route("**/firebase-config.js*", (r) =>
    r.fulfill({
      body: "window.FIREBASE_CONFIG={};",
      contentType: "text/javascript",
    }),
  );
}
async function boot(page) {
  await page.goto("/");
  await finishIntroduction(page);
  await page.locator("#language").selectOption("en");
  await page.locator("#nickname").fill("Dreamer");
  await page.locator("#ageGroup").selectOption("20代");
  await page.locator("#profile-form button[type=submit]").click();
  // Every question accepts 0 (never / first scene / neutral); the type is not under test here.
  for (let i = 0; i < QUESTIONS.length; i++) {
    await page.locator('[data-answer="0"]').click();
    await page.locator("[data-action=quiz-next]").click();
  }
  await page.locator("[data-action=begin]").click();
}
// The share box sits on the reading page and is on by default for paid members.
async function saveDream(page, text, share = false) {
  await page.locator("nav [data-go=record]").click();
  await page.locator("#dream-text").fill(text);
  await page.locator("[data-action=diagnose]").click();
  await expect(page.locator("#app")).toHaveAttribute("data-page", "reading");
  if (share) await page.locator("#share-public").check();
  else await page.locator("#share-public").uncheck();
  await page.locator("[data-action=save-reading]").click();
}
async function fixture(page, plan = "starter") {
  const store = new MemoryStore();
  for (const uid of ["alice", "bob"])
    store.data.set("memberships/" + uid, {
      plan: uid === "bob" ? plan : "standard",
      status: "active",
      paidUntil: Date.now() + 86400000 * 30,
    });
  const access = createAccess({
    store,
    verify: async (token) => ({
      uid: token.replace("test-token-", ""),
      firebase: { sign_in_provider: "password" },
    }),
  });
  const routes = [];
  const app = Object.fromEntries(
    ["get", "post"].map((method) => [
      method,
      (path, fn) => routes.push({ method: method.toUpperCase(), path, fn }),
    ]),
  );
  registerCommunity(app, { access, asyncRoute: (f) => f });
  const billing = createBilling({ access, env: {} });
  await page.route("**/cloud.js*", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body: `window.YumetanCloud={ready:Promise.resolve({enabled:true}),state:{enabled:true},uid:()=> 'bob',isAnonymous:()=>false,email:()=> 'bob@example.test',idToken:async()=> 'test-token-bob',loadOnce:async()=>[],loadDiaryOnce:async()=>[],loadProfile:async()=>null,loadTypeState:async()=>null,saveDream:async()=>{},saveDiary:async()=>{},saveProfile:async()=>{},deleteDream:async()=>{},deleteDiary:async()=>{}};`,
    }),
  );
  await page.route("**/api/**", async (r) => {
    const u = new URL(r.request().url());
    try {
      if (u.pathname === "/api/account")
        return r.fulfill({ json: await billing.account("bob") });
      let match,
        params = {};
      const endpoint = routes.find((x) => {
        if (x.method !== r.request().method()) return false;
        const names = [];
        const pattern = x.path.replace(/:([a-zA-Z]+)/g, (_, key) => {
          names.push(key);
          return "([^/]+)";
        });
        match = new RegExp("^" + pattern + "$").exec(u.pathname);
        if (!match) return false;
        params = Object.fromEntries(
          names.map((n, i) => [n, decodeURIComponent(match[i + 1])]),
        );
        return true;
      });
      if (!endpoint)
        return r.fulfill({ status: 404, json: { code: "notFound" } });
      let output;
      await endpoint.fn(
        {
          body: r.request().postDataJSON() || {},
          params,
          query: Object.fromEntries(u.searchParams),
          get: (k) => r.request().headers()[k.toLowerCase()],
        },
        { json: (v) => (output = v) },
      );
      await r.fulfill({ json: output });
    } catch (e) {
      await r.fulfill({
        status: e.status || 500,
        json: { code: e.code || e.message },
      });
    }
  });
  async function publish(uid, text) {
    let result;
    await routes
      .find((x) => x.path === "/api/community/publish")
      .fn(
        {
          body: {
            recordId: crypto.randomUUID(),
            title: "A moonlit walk",
            text,
            alias: "Night walker",
            typeId: "challenge",
            characterSet: "human",
            consent: true,
          },
          get: () => "Bearer test-token-" + uid,
        },
        { json: (r) => (result = r) },
      );
    return result.id;
  }
  return { store, publish };
}
test("Free keeps one dream and one editable diary per date; plans and paid feed are explained in all languages", async ({
  page,
}) => {
  await local(page);
  await boot(page);
  await page.locator("nav [data-go=record]").click();
  await page.locator("#dream-text").fill("First dream");
  await submitDream(page);
  // Saving clears the editor; an existing dream can still be edited.
  await page.locator("nav [data-go=record]").click();
  await savedDreamDetails(page);
  await page.locator("[data-action=edit]").click();
  await expect(page.locator("#dream-text")).toHaveValue("First dream");
  await expect(page.locator("[data-action=new-dream]")).toHaveCount(0);

  await page.locator("#dream-text").fill("Edited first dream");
  await submitDream(page);
  await savedDreamDetails(page);
  await expect(page.locator("main")).toContainText("Edited first dream");
  await page.locator("nav [data-go=community]").click();
  await expect(page.locator(".paywall")).toContainText("paid plan");
  await page.locator("[data-social=plans]").first().click();
  await expect(page.locator(".plan-comparison thead th")).toHaveCount(3);
  await expect(page.locator("main")).toContainText("¥490");
  await page.locator("[data-social=yearly]").click();
  await expect(page.locator("main")).toContainText("¥4,900");
  await expect(page.locator("main")).toContainText("¥9,800");
  for (const lang of ["ja", "ko", "zh", "en"]) {
    await page.locator("#header [data-go=settings]").click();
    await page.locator("#language").selectOption(lang);
    await page.locator("[data-go=plans]").click();
    await expect(page.locator(".plan-comparison thead th")).toHaveCount(3);
    await expect(page.locator("main")).not.toContainText("undefined");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: "test-results/plans-mobile.png",
    fullPage: true,
  });
});
// Holds the pointer on an element for a long press, then lets go.
async function longPress(page, locator) {
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
}
test("paid member reads another user and reacts with stamps by button, long press and count", async ({
  page,
}) => {
  const s = await fixture(page);
  const id = await s.publish(
    "alice",
    "A dream with <img src=x onerror=alert(1)> in the sky.",
  );
  await boot(page);
  await page.locator("nav [data-go=community]").click();
  const card = page.locator(".feed-card");
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("<img src=x");
  await expect(page.locator(".feed-card .prose img")).toHaveCount(0);
  // Timeline cards: the author's character, nickname and the dream only.
  await expect(page.locator(".feed-card .post-avatar")).toHaveAttribute(
    "src",
    /characters\/.*challenge\.webp$/,
  );
  await expect(page.locator(".feed-card .post-name")).toHaveText(
    "Night walker",
  );
  await expect(card).not.toContainText("A moonlit walk");
  await expect(page.locator(".feed-card h2")).toHaveCount(0);
  for (const action of ["refresh", "plans"])
    await expect(page.locator(`main [data-social=${action}].btn`)).toHaveCount(
      0,
    );
  // No comments, reports or blocks anywhere.
  for (const gone of ["report", "quick-report", "block", "unblock"])
    await expect(page.locator(`[data-social=${gone}]`)).toHaveCount(0);
  await expect(page.locator("#comment-form")).toHaveCount(0);
  await page.screenshot({
    path: "test-results/feed-mobile.png",
    fullPage: true,
  });
  // The reaction button opens all twelve stamps.
  await card.locator(".stamp-add").click();
  const sheet = page.locator(".stamp-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.locator(".stamp-option")).toHaveCount(12);
  await expect(sheet).toContainText("Want to see it");
  await page.screenshot({ path: "test-results/stamp-sheet.png" });
  await sheet.locator('[data-stamp="heart"]').click();
  await expect(sheet).toHaveCount(0);
  const heart = card.locator('.stamp-chip[data-stamp="heart"]');
  await expect(heart).toContainText("❤️");
  await expect(heart).toContainText("1");
  await expect(heart).toHaveAttribute("aria-pressed", "true");
  expect((await s.store.get("communityPosts/" + id)).reactions.heart).toBe(1);
  // A long press opens the stamps too, and does not open the post.
  await longPress(page, card.locator(".post-text"));
  await expect(sheet).toBeVisible();
  await expect(page.locator("#app")).toHaveAttribute("data-page", "community");
  await sheet.locator('[data-stamp="funny"]').click();
  await expect(card.locator('.stamp-chip[data-stamp="funny"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // The new stamp replaced the heart.
  await expect(heart).toHaveCount(0);
  await page.screenshot({ path: "test-results/stamp-counts.png" });
  // Tapping one's own stamp takes it back.
  await card.locator('.stamp-chip[data-stamp="funny"]').click();
  await expect(card.locator(".stamp-chip")).toHaveCount(0);
  await expect(card.locator(".stamp-add")).toBeVisible();
  expect((await s.store.get("communityPosts/" + id)).reactions.funny).toBe(0);
  // The post's own page has the same stamps.
  await card.click();
  await expect(page.locator("#app")).toHaveAttribute(
    "data-page",
    "community-post",
  );
  await page.locator(".stamp-add").click();
  await page.locator('.stamp-sheet [data-stamp="scary"]').click();
  await expect(page.locator('.stamp-chip[data-stamp="scary"]')).toContainText(
    "1",
  );
  await expect(page.locator("#comment-form")).toHaveCount(0);
});
test("each dream has its own share box: ticking publishes it to the feed, unticking withdraws it, and Settings show no sharing section", async ({
  page,
}) => {
  const s = await fixture(page);
  await boot(page);
  await page.locator("nav [data-go=record]").click();
  await page.locator("#dream-text").fill("A dream shared with everyone");
  await page.locator("[data-action=diagnose]").click();
  await expect(page.locator("#share-public")).toBeChecked();
  await page.locator("[data-action=save-reading]").click();
  await savedDreamDetails(page);
  await expect(page.locator("main")).toContainText(
    "A dream shared with everyone",
  );
  const rows = await s.store.list("communityPosts");
  expect(rows.length).toBe(1);
  expect(rows[0].text).toBe("A dream shared with everyone");
  expect(rows[0].alias).toBe("Dreamer");
  // Reopening the dream shows the box ticked; unticking makes it private again.
  await page.locator("[data-action=edit]").click();
  await page.locator("[data-action=diagnose]").click();
  await expect(page.locator("#share-public")).toBeChecked();
  await page.locator("#share-public").uncheck();
  await page.locator("[data-action=save-reading]").click();
  await expect(page.locator("#dream-text")).toHaveValue("");
  await expect
    .poll(
      async () => (await s.store.get("communityPosts/" + rows[0].id)).public,
    )
    .toBe(false);
  // A second dream saved without the box stays private.
  await page.locator("nav [data-go=record]").click();
  await page.locator("[data-action=new-dream]").click();
  await page.locator("#dream-text").fill("Second, private dream");
  await page.locator("[data-action=diagnose]").click();
  await page.locator("#share-public").uncheck();
  await page.locator("[data-action=save-reading]").click();
  await expect(page.locator("#dream-text")).toHaveValue("");
  expect(
    (await s.store.list("communityPosts")).filter((p) => p.public).length,
  ).toBe(0);
  // Settings: only sign out and delete remain for the account, no sharing card.
  await page.locator("#header [data-go=settings]").click();
  await expect(page.locator("main")).not.toContainText("Account & sync");
  await expect(page.locator("[data-visibility]")).toHaveCount(0);
  await expect(page.locator("[data-action=signout]")).toBeVisible();
  await expect(page.locator("[data-action=delete-account]")).toBeVisible();
  await expect(page.locator("[data-action=sync]")).toHaveCount(0);
});
test("a paid member can switch to another paid plan; Free only offers details", async ({
  page,
}) => {
  await fixture(page);
  await boot(page);
  await page.locator("#header [data-go=settings]").click();
  await page.locator("[data-go=plans]").click();
  await expect(page.locator(".plan-comparison thead th.current")).toContainText(
    "Starter",
  );
  await expect(page.locator(".plan-cta-row .plan-cta")).toHaveCount(1);
  await expect(page.locator(".plan-cta-row .plan-cta")).toHaveText("Switch");
  await expect(page.locator(".plan-cta-row td").first()).toBeEmpty();
  await expect(page.locator(".plan-links [data-plan=free]")).toBeVisible();
  await page.locator(".plan-links [data-plan=standard]").click();
  await expect(page.locator(".plan-card .plan-cta")).toHaveText(
    "Switch to Standard",
  );
  // In the browser the store is not available, so the button explains that.
  await expect(page.locator(".plan-card .plan-cta")).toBeDisabled();
  await expect(page.locator(".plan-card .cta-note")).toContainText(
    "iOS / Android",
  );
});
test("sharing needs explicit consent; only the public copy is sent and an expired member still withdraws it", async ({
  page,
}) => {
  const s = await fixture(page);
  await boot(page);
  await saveDream(page, "Private original dream");
  await savedDreamDetails(page);
  expect((await s.store.list("communityPosts")).length).toBe(0);
  await page.locator("[data-go=share]").click();
  await expect(page.locator("#share-form")).toBeVisible();
  await page.locator("#share-title").fill("Shared dream");
  await page.locator("#share-text").fill("Only this public copy");
  await page.locator("#share-form button").click();
  expect((await s.store.list("communityPosts")).length).toBe(0);
  await page.locator("#share-consent").check();
  page.on("dialog", (d) => d.accept());
  await page.locator("#share-form button").click();
  await expect(page.locator("[data-social=unpublish]")).toBeVisible();
  const rows = await s.store.list("communityPosts");
  expect(rows.length).toBe(1);
  expect(rows[0].text).toBe("Only this public copy");
  expect(JSON.stringify(rows)).not.toContain("Private original dream");
  s.store.data.set("memberships/bob", { plan: "free" });
  await page.reload();
  await page.locator("nav [data-go=record]").click();
  await savedDreamDetails(page);
  await expect(page.locator("main")).toContainText("Private original dream");
  await page.locator("[data-go=share]").click();
  await expect(page.locator("[data-social=unpublish]")).toBeVisible();
  // Sharing belongs to every plan, so an expired member still edits and withdraws.
  await expect(page.locator("#share-form")).toBeVisible();
  await page.locator("[data-social=unpublish]").click();
  await expect(page.locator("[data-social=unpublish]")).toHaveCount(0);
  expect((await s.store.get("communityPosts/" + rows[0].id)).public).toBe(
    false,
  );
});
test("the diagnosis is the only AI call; saving from the reading page spends none, even when the AI was unavailable", async ({
  page,
}) => {
  await fixture(page);
  await boot(page);
  let calls = 0;
  await page.route("**/api/reflect", (r) => {
    calls++;
    return r.fulfill({ status: 503, json: { code: "aiUnavailable" } });
  });
  await saveDream(page, "Save locally");
  await savedDreamDetails(page);
  await expect(page.locator("main")).toContainText("Save locally");
  expect(calls).toBe(1);
});

test("real HTTP APIs never authorize by claimed plan, user ID or own key and do not cache private data", async ({
  request,
}) => {
  const response = await request.get("/api/community/feed", {
    headers: {
      "X-Yumetan-User": "admin",
      "X-Yumetan-Key": "fake-personal-key",
    },
  });
  expect([401, 503]).toContain(response.status());
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(await response.json()).not.toHaveProperty("posts");
  const publish = await request.post("/api/community/publish", {
    data: {
      plan: "standard",
      uid: "admin",
      consent: true,
      text: "Do not publish",
    },
  });
  expect([401, 503]).toContain(publish.status());
  const old = await request.post("/api/listen", {
    data: { messages: [{ role: "user", text: "No paid bypass" }] },
  });
  expect(old.status()).toBe(404);
});

test("free members see three 15-character teasers with whole names and titles; read more and see more open the plans", async ({
  page,
}) => {
  const s = await fixture(page, "free");
  for (let i = 0; i < 3; i++)
    await s.publish(
      "alice",
      `Dream number ${i}: a long walk under a paper moon that never sets.`,
    );
  await boot(page);
  await page.locator("nav [data-go=community]").click();
  await expect(page.locator(".teaser-card")).toHaveCount(3);
  for (const text of await page.locator(".teaser-text").allInnerTexts()) {
    expect(text.replace(/… Read more$/, "").length).toBeLessThanOrEqual(15);
    expect(text).toContain("Read more");
  }
  // Only the dream is shortened: the name and the title are shown whole.
  await expect(page.locator(".teaser-card .post-name").first()).toHaveText(
    "Night walker",
  );
  await expect(page.locator(".teaser-card .post-title").first()).toHaveText(
    "A moonlit walk",
  );
  await expect(page.locator("main")).not.toContainText("never sets");
  await expect(page.locator(".paywall")).toHaveCount(0);
  await page.locator(".teaser-card .link-button").first().click();
  await expect(page.locator(".plan-comparison thead th")).toHaveCount(3);
  await page.locator("nav [data-go=community]").click();
  await page.locator(".teaser [data-social=plans].btn").click();
  await expect(page.locator(".plan-comparison thead th")).toHaveCount(3);
});
test("a free member publishes a dream and reads it whole in the feed, marked as their own", async ({
  page,
}) => {
  const s = await fixture(page, "free");
  await s.publish("alice", "Another member's dream that stays shortened here.");
  await boot(page);
  // The share box is available on the free plan, off until it is ticked.
  await page.locator("nav [data-go=record]").click();
  await page.locator("#dream-text").fill("I walked the whole shoreline alone.");
  await page.locator("[data-action=diagnose]").click();
  await expect(page.locator("#share-public")).toBeEnabled();
  await expect(page.locator("#share-public")).not.toBeChecked();
  await page.locator("#share-public").check();
  await page.locator("[data-action=save-reading]").click();
  expect(
    (await s.store.list("communityPosts")).filter(
      (p) => p.public && p.text === "I walked the whole shoreline alone.",
    ).length,
  ).toBe(1);
  // Own posts are never shortened and carry the coloured "you" mark.
  await page.locator("nav [data-go=community]").click();
  const mine = page.locator(".feed-card.post-mine");
  await expect(mine).toHaveCount(1);
  await expect(mine).toContainText("I walked the whole shoreline alone.");
  await expect(mine.locator(".post-badge")).toHaveText("You");
  await expect(mine.locator(".link-button")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("stays shortened here");
  // Nobody stamps their own post.
  await expect(mine.locator(".stamp-add")).toHaveCount(0);
  // Opening it shows the post itself.
  await mine.click();
  await expect(page.locator("#app")).toHaveAttribute(
    "data-page",
    "community-post",
  );
  await expect(page.locator("#comment-form")).toHaveCount(0);
  await expect(page.locator("main")).toContainText("I walked the whole");
});
test("free limits lead to the plans page: the day's dream allowance, a fourth diary save, and subscribe buttons everywhere", async ({
  page,
}) => {
  await local(page);
  await boot(page);
  await page.locator("nav [data-go=record]").click();
  await page.locator("#dream-text").fill("Only dream of the day");
  await submitDream(page);
  await savedDreamDetails(page);
  // The "new dream" chip becomes a plans link once the free allowance is used.
  await page.locator("nav [data-go=record]").click();
  await expect(page.locator("[data-action=new-dream]")).toHaveCount(0);
  await page.locator(".tag-cta").click();
  await expect(page.locator(".plan-comparison thead th")).toHaveCount(3);
  await expect(page.locator(".plan-recommend .plan-cta")).toBeVisible();
  await expect(page.locator(".plan-cta-row .plan-cta")).toHaveCount(2);
  await page.locator(".plan-links [data-plan=starter]").click();
  await expect(page.locator(".plan-detail-bottom .plan-cta")).toBeVisible();
  // Diary: the third save is fine, the fourth opens the plans and keeps the text.
  await page.locator("nav [data-go=diary]").click();
  for (let i = 1; i <= 3; i++) {
    await page.locator("#diary-text").fill(`Diary save ${i}`);
    await page.locator("#diary-form button[type=submit]").click();
    await expect(page.locator("#toast")).toContainText("Saved");
  }
  await page.locator("#diary-text").fill("Diary save 4 goes to plans");
  await page.locator("#diary-form button[type=submit]").click();
  await expect(page.locator("#app")).toHaveAttribute("data-page", "plans");
  await expect(page.locator("#toast")).toContainText("plan");
  await page.locator(".back-link").click();
  await expect(page.locator("#diary-text")).toHaveValue(
    "Diary save 4 goes to plans",
  );
});
test("a free member sees the stamps a teaser received but cannot react", async ({
  page,
}) => {
  const s = await fixture(page, "free");
  const id = await s.publish(
    "alice",
    "A dream from another member, with reactions already.",
  );
  const stored = await s.store.get("communityPosts/" + id);
  s.store.data.set("communityPosts/" + id, {
    ...stored,
    reactions: { heart: 2, wonder: 1 },
  });
  await boot(page);
  await page.locator("nav [data-go=community]").click();
  const teaser = page.locator(".teaser-card");
  await expect(teaser).toHaveCount(1);
  // The counts are shown, as plain labels, and there is no reaction button.
  await expect(teaser.locator(".stamp-chip")).toHaveCount(2);
  await expect(teaser.locator("button.stamp-chip")).toHaveCount(0);
  await expect(teaser.locator(".stamp-chip").first()).toContainText("🔮");
  await expect(teaser.locator(".stamp-add")).toHaveCount(0);
  for (const gone of ["quick-report", "block"])
    await expect(page.locator(`[data-social=${gone}]`)).toHaveCount(0);
  // A long press says stamps come with a paid plan.
  await longPress(page, teaser.locator(".post-title"));
  await expect(page.locator("#toast")).toContainText(
    "Reacting with stamps comes with a paid plan",
  );
  await expect(page.locator(".stamp-sheet")).toHaveCount(0);
});
test("the plans page states the renewal terms and links to the terms of use and privacy policy", async ({
  page,
}) => {
  const opened = [];
  await page.exposeFunction("__opened", (url) => opened.push(url));
  await page.addInitScript(() => {
    window.open = (url) => window.__opened(url);
  });
  await fixture(page, "free");
  await boot(page);
  await page.locator("#header [data-go=settings]").click();
  await page.locator("[data-go=plans]").click();
  await expect(page.locator(".legal-note")).toContainText("auto-renewing");
  for (const label of ["Terms of Use", "Privacy policy"])
    await page.locator(`.legal-links button:has-text("${label}")`).click();
  expect(opened).toEqual([
    new URL("/legal/terms.html?lang=en", page.url()).href,
    new URL("/legal/privacy.html?lang=en", page.url()).href,
  ]);
});
// The store app: Capacitor reports a native iOS platform and a RevenueCat
// plugin whose customer info (what the store knows on this device) the test
// sets through window.__storeInfo.
async function nativeStore(page, info) {
  await page.addInitScript((initial) => {
    window.__storeInfo = initial;
    window.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => "ios",
      Plugins: {
        Purchases: {
          configure: async () => {},
          logIn: async () => {},
          getCustomerInfo: async () => ({ customerInfo: window.__storeInfo }),
        },
      },
    };
  }, info);
  await page.route("**/config.js*", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body: 'window.YUMETAN_CONFIG={apiBase:"",revenueCat:{ios:"appl_test"}};',
    }),
  );
}
const noSubscription = {
  entitlements: { active: {} },
  activeSubscriptions: [],
};
const standardUntil = (until) => ({
  entitlements: {
    active: {
      standard: {
        productIdentifier: "com.doyle.yumetan.standard.monthly",
        expirationDateMillis: until,
      },
    },
  },
  activeSubscriptions: ["com.doyle.yumetan.standard.monthly"],
});
// The server's `POST /api/billing/sync`: RevenueCat is read again, which the
// test decides through `next` (the membership it finds).
async function syncRoute(page, s, next) {
  const calls = [];
  await page.route("**/api/billing/sync", async (r) => {
    const member = next();
    calls.push(member.plan);
    s.store.data.set("memberships/bob", member);
    const until = member.paidUntil || null;
    await r.fulfill({
      json: {
        plan: member.plan,
        paidUntil: until,
        cancelAtPeriodEnd: Boolean(member.cancelAtPeriodEnd),
        billingConfigured: true,
        usage: { day: {}, month: {} },
      },
    });
  });
  return calls;
}
test("a cancelled subscription the store has ended returns the app to Free, even when the server had not heard", async ({
  page,
}) => {
  await nativeStore(page, noSubscription);
  // The server still has Standard (a missed webhook); the store has nothing.
  const s = await fixture(page, "standard");
  const calls = await syncRoute(page, s, () => ({
    plan: "free",
    status: "expired",
    paidUntil: 0,
  }));
  await boot(page);
  await page.locator("#header [data-go=settings]").click();
  await page.locator("[data-go=plans]").click();
  await expect(page.locator(".plan-comparison thead th.current")).toContainText(
    "Free",
  );
  expect(calls.length).toBeGreaterThan(0);
  await expect(page.locator(".plan-state")).toHaveCount(0);
});
test("a purchase the server has yet to see shows the bought plan, says so, and settles on a recheck", async ({
  page,
}) => {
  const until = Date.now() + 86400000 * 30;
  await nativeStore(page, standardUntil(until));
  // The server has no subscription yet; RevenueCat lags behind the store.
  const s = await fixture(page, "free");
  let caughtUp = false;
  await syncRoute(page, s, () =>
    caughtUp
      ? { plan: "standard", status: "active", paidUntil: until }
      : { plan: "free", status: "expired", paidUntil: 0 },
  );
  await boot(page);
  await page.locator("#header [data-go=settings]").click();
  await page.locator("[data-go=plans]").click();
  // The page marks what the store confirmed, as the rest of the app does,
  // and says the server has yet to catch up.
  await expect(page.locator(".plan-comparison thead th.current")).toContainText(
    "Standard",
  );
  await expect(page.locator(".plan-state")).toContainText(
    "The store confirmed your Standard purchase",
  );
  caughtUp = true;
  await page.locator(".plan-state [data-social=resync]").click();
  await expect(page.locator(".plan-state")).toHaveCount(0);
  await expect(page.locator(".plan-comparison thead th.current")).toContainText(
    "Standard",
  );
});
test("a cancellation keeps the plan until its end date and says when Free returns", async ({
  page,
}) => {
  const until = Date.now() + 86400000 * 10;
  await nativeStore(page, standardUntil(until));
  const s = await fixture(page, "standard");
  s.store.data.set("memberships/bob", {
    plan: "standard",
    status: "active",
    paidUntil: until,
    cancelAtPeriodEnd: true,
  });
  await boot(page);
  await page.locator("#header [data-go=settings]").click();
  await page.locator("[data-go=plans]").click();
  await expect(page.locator(".plan-comparison thead th.current")).toContainText(
    "Standard",
  );
  await expect(page.locator(".plan-state")).toContainText(
    "Cancelled. Standard stays until",
  );
});
test("the feed lists only dreams shared today and says so", async ({
  page,
}) => {
  const s = await fixture(page);
  const old = await s.publish("alice", "A dream shared yesterday.");
  await s.publish("alice", "A dream shared today.");
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const path = "communityPosts/" + old;
  s.store.data.set(path, {
    ...s.store.data.get(path),
    publishedAt: yesterday,
    sortKey: `${yesterday}_${old}`,
  });
  const requests = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/community/feed")) requests.push(r.url());
  });
  await boot(page);
  await page.locator("nav [data-go=community]").click();
  await expect(page.locator(".feed-card")).toHaveCount(1);
  await expect(page.locator("main")).toContainText("A dream shared today.");
  await expect(page.locator("main")).not.toContainText("shared yesterday");
  await expect(page.locator("main")).toContainText(
    "Showing the dreams shared today",
  );
  const expected = await page.evaluate(() => {
    const d = new Date();
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return `day=${day}&tz=${d.getTimezoneOffset()}`;
  });
  expect(requests[0]).toContain(expected);
});
