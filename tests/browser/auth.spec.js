import { savedDreamDetails } from "./helpers/journal.js";
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
  await page.route("**/firebase-config.js*", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body: "window.FIREBASE_CONFIG={};",
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
test("three social logins and guest are available before registration in four languages", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/");
  for (const lang of ["ja", "en", "ko", "zh"]) {
    await page.locator("#language").selectOption(lang);
    await page.locator(".onboard-account > summary").click();
    for (const provider of ["google", "apple", "line"])
      await expect(
        page.locator(`[data-auth-provider=${provider}]`),
      ).toBeEnabled();
    await expect(page.locator("[data-action=guest]")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await expect(page.locator("main")).not.toContainText("undefined");
  }
  await page.locator("[data-action=guest]").click();
  await expect(page.locator("#nickname")).toBeFocused();
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
    await page.locator(".onboard-account > summary").click();
    await page.locator(`[data-auth-provider=${provider}]`).click();
    await expect(page.locator("main")).toContainText("アカウントA");
    await page.locator("nav [data-go=record]").click();
    await savedDreamDetails(page);
    await expect(page.locator("main")).toContainText("Aだけの夢");
    await expect(page.locator(".photo")).toHaveAttribute("src", /data:image/);
  }
  await first.locator("#header [data-go=settings]").click();
  await first.locator("[data-action=signout]").click();
  await expect(first.locator("#nickname")).toBeVisible();
  await expect(first.locator("main")).not.toContainText("Aだけの夢");
  await first.locator(".onboard-account > summary").click();
  await first.locator("[data-auth-provider=line]").click();
  await expect(first.locator("main")).toContainText("アカウントB");
  await first.locator("nav [data-go=record]").click();
  await first.locator("[data-open-days=dream]").click();
  await expect(first.locator(".day-record")).toHaveCount(0);
  await c1.close();
  await c2.close();
});
test("guest records import only after consent; account linking and cancellation keep the same records", async ({
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
  await expect(page.locator("#header [data-go=settings]")).toBeVisible();
  await page.locator("#header [data-go=settings]").click();
  page.once("dialog", (d) => d.accept());
  await page.locator("[data-auth-provider=google]").click();
  await expect(page.locator("main")).toContainText("会員");
  await page.locator("nav [data-go=record]").click();
  await page.locator("[data-open-days=dream]").click();
  await expect(page.locator(".day-record")).toHaveCount(2);
  await page.locator("#header [data-go=settings]").click();
  page.once("dialog", (d) => d.accept());
  await page.locator("[data-auth-provider=apple]").click();
  expect(
    await page.evaluate(() => window.__authCalls.at(-1).opts.link),
  ).toBeTruthy();
  await page.evaluate(() => (window.__cancel = true));
  page.once("dialog", (d) => d.accept());
  await page.locator("[data-auth-provider=line]").click();
  await expect(page.locator("#toast")).toContainText("キャンセル");
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
  await page.locator("#header [data-go=settings]").click();
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
  await page.locator(".onboard-account > summary").click();
  await expect(page.locator("[data-auth-provider=google]")).toBeDisabled();
  await expect(page.locator("#account-sync-status")).toContainText(
    "接続できません",
  );
  await expect(page.locator("[data-auth-provider=google]")).toBeEnabled({
    timeout: 10000,
  });
  for (const provider of ["apple", "line"])
    await expect(
      page.locator(`[data-auth-provider=${provider}]`),
    ).toBeEnabled();
  expect(await page.evaluate(() => window.__sameDocument)).toBe(true);
  await expect(page.locator("#account-sync-status")).not.toContainText(
    "接続できません",
  );
});
