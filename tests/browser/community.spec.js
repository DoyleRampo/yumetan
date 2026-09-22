import { finishIntroduction } from "./helpers/introduction.js";
import { chooseDate, savedDreamDetails } from "./helpers/journal.js";
import { test, expect } from "@playwright/test";
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
  for (let i = 0; i < 16; i++) {
    await page.locator(`[data-answer="${i === 11 ? 2 : 0}"]`).click();
    await page.locator("[data-action=quiz-next]").click();
  }
  await page.locator("[data-action=begin]").click();
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
  await page.locator("#dream-form button[type=submit]").click();
  // Saving clears the editor; an existing dream can still be edited.
  await page.locator("nav [data-go=record]").click();
  await savedDreamDetails(page);
  await page.locator("[data-action=edit]").click();
  await expect(page.locator("#dream-text")).toHaveValue("First dream");
  await expect(page.locator("[data-action=new-dream]")).toHaveCount(0);

  await page.locator("#dream-text").fill("Edited first dream");
  await page.locator("#dream-form button[type=submit]").click();
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
test("paid member reads another user, stamps, comments, reports and blocks through authenticated server handlers", async ({
  page,
}) => {
  const s = await fixture(page);
  const id = await s.publish(
    "alice",
    "A dream with <img src=x onerror=alert(1)> in the sky.",
  );
  await boot(page);
  await page.locator("nav [data-go=community]").click();
  await expect(page.locator(".feed-card")).toHaveCount(1);
  await expect(page.locator(".feed-card")).toContainText("<img src=x");
  await expect(page.locator(".feed-card .prose img")).toHaveCount(0);
  await page.screenshot({
    path: "test-results/feed-mobile.png",
    fullPage: true,
  });
  await page.locator("[data-social=post]").click();
  await page.locator('[data-stamp="✨"]').click();
  await expect(page.locator('[data-stamp="✨"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("#comment-text").fill("Such a beautiful dream");
  await page.locator("#comment-form button").click();
  await expect(page.locator(".comment")).toContainText(
    "Such a beautiful dream",
  );
  await page.locator("[data-social=report]").click();
  await expect(page.locator("#toast")).toContainText("Reported");
  page.on("dialog", (d) => d.accept());
  await page.locator("[data-social=block]").click();
  await expect(page.locator(".feed-card")).toHaveCount(0);
  expect((await s.store.list("communityReports")).length).toBe(1);
});
test("sharing needs explicit consent; only public copy is sent and expired owners can unpublish", async ({
  page,
}) => {
  const s = await fixture(page);
  await boot(page);
  await page.locator("nav [data-go=record]").click();
  await page.locator("#dream-text").fill("Private original dream");
  await page.locator("#dream-form button[type=submit]").click();
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
  await expect(page.locator("#share-form")).toHaveCount(0);
  await page.locator("[data-social=unpublish]").click();
  await expect(page.locator("[data-social=unpublish]")).toHaveCount(0);
  expect((await s.store.get("communityPosts/" + rows[0].id)).public).toBe(
    false,
  );
});
test("saving as a paid member never spends a GPT call", async ({ page }) => {
  await fixture(page);
  await boot(page);
  let calls = 0;
  await page.route("**/api/reflect", (r) => {
    calls++;
    return r.fulfill({ status: 503, json: { code: "aiUnavailable" } });
  });
  await page.locator("nav [data-go=record]").click();
  await page.locator("#dream-text").fill("Save locally");
  await page.locator("#dream-form button[type=submit]").click();
  await savedDreamDetails(page);
  await expect(page.locator("main")).toContainText("Save locally");
  expect(calls).toBe(0);
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
