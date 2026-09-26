import { savedDreamDetails } from "./helpers/journal.js";
import { passTour } from "./helpers/introduction.js";
import { test, expect } from "@playwright/test";
import { mergeAccount } from "../../public/core/account-sync.js";
const profile = (nickname) => ({
  nickname,
  language: "ja",
  typeAnswers: Array(16).fill(0),
  updatedAt: "2026-09-17T00:00:00Z",
  characterSet: "moonkeepers-v1",
});
const dream = (id, text) => ({
  id,
  text,
  kind: "dream",
  createdAt: "2026-09-15T00:00:00Z",
  updatedAt: "2026-09-15T00:00:00Z",
  date: "2026-09-15",
  photo:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aEAAAAABJRU5ErkJggg==",
});
async function setup(page, db = new Map(), readyDelay = 0) {
  // Firebase is configured, so an account is required before registration.
  await page.route("**/firebase-config.js*", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body: "window.FIREBASE_CONFIG={apiKey:'test',projectId:'test'};",
    }),
  );
  await page.route("**/cloud.js*", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body: `
let uid=localStorage.getItem('auth.test.uid') || 'guest-1'; let listeners=[];
const anon=()=>uid.startsWith('guest'); const user=()=>({uid,isAnonymous:anon()});
window.__authCalls=[];
const cloud=window.YumetanCloud={state:{enabled:${readyDelay}===0,user:user()}, ready:new Promise(r=>setTimeout(()=>{cloud.state.enabled=true;r({enabled:true});},${readyDelay})), uid:()=>uid,isAnonymous:anon,email:()=>anon()?'':uid+'@test.invalid', providers:()=>anon()?[]:['google.com'],onUser:cb=>listeners.push(cb),idToken:async()=> 'test',
syncSnapshot: async snapshot => {const res=await fetch('/__test/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uid,snapshot})});if(!res.ok)throw Error('offline');return res.json();},
signInProvider:async (provider,opts)=>{window.__authCalls.push({provider,opts});if(window.__cancel)throw {code:'auth/popup-closed-by-user'};if(!opts.link){uid=provider==='line'?'member-b':'member-a';localStorage.setItem('auth.test.uid',uid);}cloud.state.user=user();listeners.forEach(cb=>cb(user()));return user();},
signOut:async()=>{uid='guest-'+crypto.randomUUID();localStorage.setItem('auth.test.uid',uid);cloud.state.user=user();listeners.forEach(cb=>cb(user()));return user();}};
`,
    }),
  );
  await page.route("**/__test/sync", async (r) => {
    const { uid, snapshot } = r.request().postDataJSON();
    const merged = mergeAccount(
      snapshot,
      db.get(uid) || { profile: null, records: [], deleted: [] },
    );
    db.set(uid, merged);
    await r.fulfill({ json: merged });
  });
  await page.route("**/api/account", (r) =>
    r.fulfill({ status: 503, json: { code: "serviceUnavailable" } }),
  );
  return db;
}
test("the Japanese login wall offers three social logins and keeps language choice at registration", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/");
  await page.locator("[data-action=intro-skip]").click();
  await expect(page.locator("#app")).toHaveAttribute(
    "data-page",
    "welcome-login",
  );
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator("#language")).toHaveCount(0);
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    for (const provider of ["google", "apple", "line"])
      await expect(
        page.locator(`[data-auth-provider=${provider}]`),
      ).toBeEnabled();
    await expect(page.locator("[data-action=guest]")).toHaveCount(0);
    await expect(page.locator("#nickname")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await expect(page.locator("main")).not.toContainText("undefined");
  }
  // Registration follows the login; the account is new so the form is empty.
  await page.locator("[data-auth-provider=google]").click();
  await expect(page.locator("#nickname")).toBeVisible();
  await expect(page.locator("main")).not.toContainText(
    "ログイン（あとでもOK）",
  );
  await expect(page.locator("main")).not.toContainText("タイプについて");
  await page.screenshot({
    path: "test-results/login-mobile.png",
    fullPage: true,
  });
});
test("login restores account on a new device; logout isolates data and LINE chooses another account", async ({
  browser,
}) => {
  const db = new Map([
    [
      "member-a",
      {
        profile: profile("アカウントA"),
        records: [dream("a-dream", "Aだけの夢")],
        deleted: [],
      },
    ],
    ["member-b", { profile: profile("アカウントB"), records: [], deleted: [] }],
  ]);
  const c1 = await browser.newContext(),
    c2 = await browser.newContext();
  const first = await c1.newPage(),
    second = await c2.newPage();
  await setup(first, db);
  await setup(second, db);
  for (const [page, provider] of [
    [first, "google"],
    [second, "apple"],
  ]) {
    await page.goto("/");
    await passTour(page);
    await page.locator(`[data-auth-provider=${provider}]`).click();
    // An account that already registered skips the form and lands on home.
    await expect(page.locator("#app")).toHaveAttribute("data-page", "home");
    await expect(page.locator("main")).toContainText("アカウントA");
    await page.locator("nav [data-go=record]").click();
    await savedDreamDetails(page);
    await expect(page.locator("main")).toContainText("Aだけの夢");
    await expect(page.locator(".photo")).toHaveAttribute("src", /data:image/);
  }
  await first.locator("#header [data-go=settings]").click();
  await first.locator("[data-action=signout]").click();
  await expect(first.locator("#app")).toHaveAttribute(
    "data-page",
    "welcome-login",
  );
  await expect(first.locator("main")).not.toContainText("Aだけの夢");
  await first.locator("[data-auth-provider=line]").click();
  await expect(first.locator("main")).toContainText("アカウントB");
  await first.locator("nav [data-go=record]").click();
  await first.locator("[data-open-days=dream]").click();
  await expect(first.locator(".day-record")).toHaveCount(0);
  await c1.close();
  await c2.close();
});
test("guest records import only after consent; settings offer only sign out and deletion", async ({
  page,
}) => {
  const db = new Map([
    [
      "guest-1",
      {
        profile: profile("ゲスト"),
        records: [dream("guest-dream", "ゲストの夢")],
        deleted: [],
      },
    ],
    [
      "member-a",
      {
        profile: profile("会員"),
        records: [dream("member-dream", "会員の夢")],
        deleted: [],
      },
    ],
  ]);
  await setup(page, db);
  await page.goto("/");
  await passTour(page);
  page.once("dialog", (d) => d.accept());
  await page.locator("[data-auth-provider=google]").click();
  await expect(page.locator("main")).toContainText("会員");
  await page.locator("nav [data-go=record]").click();
  await page.locator("[data-open-days=dream]").click();
  await expect(page.locator(".day-record")).toHaveCount(2);
  // Settings no longer link further sign-in methods: only sign out and delete.
  await page.locator("#header [data-go=settings]").click();
  await expect(page.locator("[data-auth-provider]")).toHaveCount(0);
  await expect(page.locator("[data-action=signout]")).toBeVisible();
  await expect(page.locator("[data-action=delete-account]")).toBeVisible();
  await page.locator("nav [data-go=record]").click();
  await page.locator("[data-open-days=dream]").click();
  await expect(page.locator(".day-record")).toHaveCount(2);
});
test("declining guest import leaves both accounts intact", async ({ page }) => {
  const db = new Map([
    [
      "guest-1",
      {
        profile: profile("ゲスト"),
        records: [dream("guest-dream", "ゲストの夢")],
        deleted: [],
      },
    ],
    ["member-a", { profile: profile("会員"), records: [], deleted: [] }],
  ]);
  await setup(page, db);
  await page.goto("/");
  await passTour(page);
  page.once("dialog", (d) => d.dismiss());
  await page.locator("[data-auth-provider=apple]").click();
  await page.locator("nav [data-go=record]").click();
  await page.locator("[data-open-days=dream]").click();
  await expect(page.locator(".day-record")).toHaveCount(0);
  expect(db.get("guest-1").records).toHaveLength(1);
  expect(db.get("member-a").records).toHaveLength(0);
  await page.locator("#header [data-go=settings]").click();
  page.once("dialog", (d) => d.accept());
  await page.locator("[data-action=import-guest]").click();
  await page.locator("nav [data-go=record]").click();
  await page.locator("[data-open-days=dream]").click();
  await expect(page.locator(".day-records")).toContainText("ゲストの夢");
});
test("a slow cloud connection enables the social logins later without a reload", async ({
  page,
}) => {
  await setup(page, new Map(), 4500);
  await page.goto("/");
  await page.evaluate(() => (window.__sameDocument = true));
  await page.locator("[data-action=intro-skip]").click();
  await expect(page.locator("[data-auth-provider=google]")).toBeDisabled();
  await expect(page.locator("#account-sync-status")).toContainText(
    "夢の世界につないでいます",
  );
  await expect(
    page.locator("#account-sync-status .dream-loading"),
  ).toBeVisible();
  await expect(page.locator("[data-auth-provider=google]")).toBeEnabled({
    timeout: 10000,
  });
  for (const provider of ["apple", "line"])
    await expect(
      page.locator(`[data-auth-provider=${provider}]`),
    ).toBeEnabled();
  expect(await page.evaluate(() => window.__sameDocument)).toBe(true);
  await expect(page.locator("#account-sync-status")).not.toContainText(
    "夢の世界につないでいます",
  );
});
test("deleting an account clears this device, so the next login registers from scratch", async ({
  page,
}) => {
  const db = new Map([
    [
      "member-a",
      {
        profile: profile("会員"),
        records: [dream("kept", "会員の夢")],
        deleted: [],
      },
    ],
  ]);
  await setup(page, db);
  // A cache an earlier account or guest left on this device.
  await page.addInitScript(() => {
    localStorage.setItem(
      "yumetan.v4.local",
      JSON.stringify({
        version: 4,
        profile: {
          nickname: "むかしの人",
          language: "ja",
          typeAnswers: Array(16).fill(0),
          updatedAt: "2026-09-01T00:00:00Z",
        },
        records: [],
        deleted: [],
      }),
    );
  });
  const deletions = [];
  await page.route("**/api/account/delete", async (r) => {
    deletions.push(r.request().postDataJSON());
    db.clear();
    await r.fulfill({ json: { deleted: true, posts: 0 } });
  });
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await expect(page.locator("#app")).toHaveAttribute(
    "data-page",
    "welcome-login",
  );
  await page.locator("[data-auth-provider=google]").click();
  await expect(page.locator("#app")).toHaveAttribute("data-page", "home");
  await expect(page.locator("main")).toContainText("会員");
  await page.locator("#header [data-go=settings]").click();
  await page.locator("[data-action=delete-account]").click();
  await expect(page.locator("#app")).toHaveAttribute(
    "data-page",
    "welcome-login",
  );
  expect(deletions).toHaveLength(1);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter(
        (k) => k.startsWith("yumetan.") && k !== "yumetan.v4.options",
      ),
    ),
  ).not.toContain("yumetan.v4.local");
  // Logging in again is a first-time user: registration, then the quiz.
  await page.locator("[data-auth-provider=google]").click();
  await expect(page.locator("#nickname")).toBeVisible();
  await expect(page.locator("main")).not.toContainText("むかしの人");
  await page.locator("#nickname").fill("あたらしい人");
  await page.locator("#profile-form button[type=submit]").click();
  await expect(page.locator('[data-answer="2"]')).toBeVisible();
});
// The reported failure: with anonymous sign-in unavailable the device falls back
// to the shared local scope after deleting, and an older cache there used to be
// carried into the next account, skipping registration and the quiz.
test("a cache from an earlier account never survives deletion, even without an anonymous uid", async ({
  page,
}) => {
  const db = new Map([
    ["member-a", { profile: profile("会員"), records: [], deleted: [] }],
  ]);
  await setup(page, db);
  // Registered last, so it replaces the shared cloud stub above.
  await page.route("**/cloud.js*", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body: `
let uid=localStorage.getItem('auth.test.uid') || ''; let listeners=[];
const user=()=>uid?({uid,isAnonymous:false}):null;
const cloud=window.YumetanCloud={state:{enabled:true,user:user()}, ready:Promise.resolve({enabled:true}), uid:()=>uid,isAnonymous:()=>!uid,email:()=>uid?uid+'@test.invalid':'', providers:()=>uid?['google.com']:[],onUser:cb=>listeners.push(cb),idToken:async()=>'test',
syncSnapshot: async snapshot => {const res=await fetch('/__test/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uid,snapshot})});if(!res.ok)throw Error('offline');return res.json();},
signInProvider:async (provider,opts)=>{if(!opts.link){uid='member-a';localStorage.setItem('auth.test.uid',uid);}cloud.state.user=user();listeners.forEach(cb=>cb(user()));return user();},
signOut:async()=>{uid='';localStorage.setItem('auth.test.uid','');cloud.state.user=null;listeners.forEach(cb=>cb(null));return null;}};
`,
    }),
  );
  await page.addInitScript(() => {
    localStorage.setItem(
      "yumetan.v4.local",
      JSON.stringify({
        version: 4,
        profile: {
          nickname: "むかしの人",
          language: "ja",
          typeAnswers: Array(16).fill(0),
          updatedAt: "2026-09-01T00:00:00Z",
        },
        records: [],
        deleted: [],
      }),
    );
  });
  await page.route("**/api/account/delete", async (r) => {
    db.clear();
    await r.fulfill({ json: { deleted: true, posts: 0 } });
  });
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.locator("[data-auth-provider=google]").click();
  await expect(page.locator("#app")).toHaveAttribute("data-page", "home");
  await page.locator("#header [data-go=settings]").click();
  await page.locator("[data-action=delete-account]").click();
  await expect(page.locator("#app")).toHaveAttribute(
    "data-page",
    "welcome-login",
  );
  await page.locator("[data-auth-provider=google]").click();
  await expect(page.locator("#nickname")).toBeVisible();
  await expect(page.locator("main")).not.toContainText("むかしの人");
});
test("logging back in after signing out reopens the app with the account's journals", async ({
  page,
}) => {
  const db = new Map([
    [
      "member-a",
      {
        profile: profile("会員"),
        records: [dream("kept", "会員の夢")],
        deleted: [],
      },
    ],
  ]);
  await setup(page, db);
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.locator("[data-action=intro-skip]").click();
  await page.locator("[data-auth-provider=google]").click();
  await expect(page.locator("#app")).toHaveAttribute("data-page", "home");
  await page.locator("#header [data-go=settings]").click();
  await page.locator("[data-action=signout]").click();
  await expect(page.locator("#app")).toHaveAttribute(
    "data-page",
    "welcome-login",
  );
  await page.locator("[data-auth-provider=google]").click();
  await expect(page.locator("#app")).toHaveAttribute("data-page", "home");
  await expect(page.locator("main")).toContainText("会員");
  await page.locator("nav [data-go=record]").click();
  await page.locator("[data-open-days=dream]").click();
  await expect(page.locator(".day-records")).toContainText("会員の夢");
});

test("terms and privacy pages are served in Japanese and English and describe account deletion", async ({
  page,
}) => {
  await page.goto("/legal/privacy.html?lang=en");
  await expect(page.locator("h1:visible")).toHaveText("Privacy Policy");
  await expect(page.locator("main")).toContainText("Delete my account");
  await page.goto("/legal/terms.html?lang=ja");
  await expect(page.locator("h1:visible")).toHaveText("利用規約");
  await expect(page.locator("main")).toContainText("自動更新");
  await expect(page.locator("main")).toContainText("¥490");
});
