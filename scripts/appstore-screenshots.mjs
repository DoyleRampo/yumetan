// App Store 用スクリーンショットを、アプリ本体を iPhone / iPad の実ピクセルで
// Chromium にレンダリングして撮る。合成・枠付け・ステータスバーの描き込みは
// 行わず、ステータスバー領域（セーフエリア上部）はアプリ自身の背景のまま残す。
//
// 使い方:  node scripts/appstore-screenshots.mjs [出力先=appstore-screenshots] [--only=iphone-6.9]
// 事前に別ターミナルで `PORT=3187 npm start` を起動しておく（起動していなければ自動で起動する）。
//
// バックエンドはブラウザ内でモックする（tests/browser/community.spec.js と同じ方式）。
// Firebase / OpenAI / RevenueCat へは一切通信しない。
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { MemoryStore } from "../tests/helpers/memory-store.mjs";
import { createAccess } from "../server/access.js";
import { registerCommunity } from "../server/community.js";
import { createBilling } from "../server/billing.js";
import { QUESTIONS } from "../public/core/diagnosis.js";

const args = process.argv.slice(2);
const outDir = path.resolve(args.find((a) => !a.startsWith("--")) || "appstore-screenshots");
const only = (args.find((a) => a.startsWith("--only=")) || "").slice(7);
const BASE = process.env.TEST_URL || "http://127.0.0.1:3187";

// CSS px のビューポート × 倍率 = Apple の受付ピクセルサイズ。
// insets は実機のセーフエリア（pt）。ステータスバーは描かず、この高さぶん
// アプリが自分で余白を取る（実機と同じ描画）。
const DEVICES = {
  "iphone-6.9": { label: "iPhone 16 Pro Max", width: 440, height: 956, scale: 3, insets: { top: 62, bottom: 34 }, expect: "1320x2868" },
  "iphone-6.5": { label: "iPhone 11 Pro Max", width: 414, height: 896, scale: 3, insets: { top: 44, bottom: 34 }, expect: "1242x2688" },
  "ipad-13": { label: "iPad Pro 13-inch (M4)", width: 1032, height: 1376, scale: 2, insets: { top: 24, bottom: 20 }, expect: "2064x2752" },
};

// 診断で「挑戦系（キロ）」になる回答（tests/browser/app.spec.js と同じ）。
const CHALLENGE_SHEET = QUESTIONS.map((q) =>
  q.kind === "frequency"
    ? q.group === "lucid" ? 4 : 0
    : q.kind === "scene"
      ? Math.max(0, q.options.findIndex((o) => o.type === "challenge"))
      : ["motion", "focus"].includes(q.axis) ? -2 : 0,
);

const DREAM_TEXT =
  "夜明け前の海辺を歩いていた。砂浜には小さな灯台が立っていて、近づくと扉がひとりでに開いた。螺旋階段を上りきると、昔の友人が望遠鏡をのぞいていて「もうすぐ見えるよ」と笑った。水平線の向こうから、ゆっくりと光が広がっていった。";

// 読み解き（/api/reflect）の応答。サーバーの出力と同じ項目構成。
const READING = {
  title: "灯台の階段",
  summary: "夜明け前の海辺で灯台に入り、螺旋階段を上った先で旧友と光を待つ夢。",
  reply:
    "扉がひとりでに開く場面が、この夢の中心にあります。進もうとした瞬間に道が用意されるのは、いま取り組んでいることが思ったより整ってきている合図かもしれません。階段の上で待っていた友人は、あなたの努力を知っている誰かの姿にも見えます。今週、「もうすぐ見えるよ」と声をかけてくれそうな人は誰でしょう。",
  mental_state_hint: "静かな期待と、少しの疲れが同居している状態。",
  mood_weather: "partly_cloudy",
  mood_label: "穏やかな期待",
  mental_state:
    "暗い時間帯に一人で歩き出すところから始まり、光が差すところで終わる流れは、見通しの立ちにくい日々の中で少しずつ手応えを掴んでいるときによく現れます。階段を上りきる体力が残っていることも、いまのあなたに余力があることを示しています。",
  fortune_overview:
    "最後のひと押しが効く一日。朝のうちに難しい用事を済ませると、午後は視界が開けるように進みます。",
  fortune_mood: "落ち着いた集中。昼過ぎに小さな高揚があります。",
  lucky_hint: "ラッキーアイテムは、階段や望遠鏡など「先を見る」ための道具。",
  advice: "次の一歩を教えてくれる人に、短くてもいいので連絡を。",
};

// 「みんなの夢」に並べる他の会員の投稿（今日の分だけ表示される）。
const FEED_POSTS = [
  { uid: "alice", alias: "よるねこ", typeId: "lucid", set: "animal", title: "空を泳ぐ図書館", text: "本棚が魚みたいに泳いでいて、好きな本を追いかけて屋上まで出た。開いたページの文字が星になって、しばらく空に残っていた。" },
  { uid: "carol", alias: "ひなた", typeId: "place", set: "animal", title: "祖母の家の縁側", text: "子どもの頃に通った家の縁側で、祖母と麦茶を飲んでいた。庭の風鈴が鳴るたびに、季節がひとつずつ進んでいった。" },
  { uid: "dave", alias: "ミナト", typeId: "story", set: "animal", title: "終電のあとの街", text: "終電を逃したはずなのに、駅前の商店街だけ明かりがついていた。古い喫茶店のマスターが「今日は特別だから」とコーヒーを出してくれた。" },
];

async function serverUp() {
  try {
    const r = await fetch(BASE + "/api/health");
    return r.ok;
  } catch {
    return false;
  }
}
async function ensureServer() {
  if (await serverUp()) return null;
  const child = spawn(process.execPath, ["server.js"], {
    env: { ...process.env, PORT: new URL(BASE).port },
    stdio: "ignore",
  });
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 200));
    if (await serverUp()) return child;
  }
  throw new Error("server did not start");
}

// ブラウザ内モック: Firebase なし、サインイン済み（uid=bob）、ネイティブ iOS として
// RevenueCat プラグインが居る状態。API はメモリストア + 本物のサーバーモジュール。
async function mockBackend(context, { plan }) {
  const store = new MemoryStore();
  const members = { bob: plan, alice: "standard", carol: "standard", dave: "standard" };
  for (const [uid, p] of Object.entries(members))
    if (p !== "free")
      store.data.set("memberships/" + uid, {
        plan: p,
        status: "active",
        cycle: "yearly",
        source: "manual",
        paidUntil: Date.now() + 86400000 * 300,
        syncedAt: Date.now(),
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
    ["get", "post"].map((m) => [m, (p, fn) => routes.push({ method: m.toUpperCase(), path: p, fn })]),
  );
  registerCommunity(app, { access, asyncRoute: (f) => f });
  const billing = createBilling({
    access,
    env: { REVENUECAT_SECRET_API_KEY: "sk_mock", REVENUECAT_WEBHOOK_AUTH: "mock" },
  });

  await context.route("**/firebase-config.js*", (r) =>
    r.fulfill({ contentType: "text/javascript", body: "window.FIREBASE_CONFIG={};" }),
  );
  await context.route("**/config.js*", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body: 'window.YUMETAN_CONFIG={apiBase:"",revenueCat:{ios:"appl_screenshot"}};',
    }),
  );
  await context.route("**/cloud.js*", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body: `
 const get=()=>JSON.parse(localStorage.getItem('shot.db')||'{"records":[],"profile":null}');
 const set=v=>localStorage.setItem('shot.db',JSON.stringify(v));
 window.YumetanCloud={ready:Promise.resolve({enabled:true}),state:{enabled:true},uid:()=>'bob',isAnonymous:()=>false,email:()=>'bob@example.test',idToken:async()=>'test-token-bob',loadOnce:async()=>get().records,loadDiaryOnce:async()=>[],loadProfile:async()=>get().profile,loadTypeState:async()=>null,saveDream:async r=>set({...get(),records:[...get().records.filter(x=>x.id!==r.id),r]}),saveDiary:async()=>{},saveProfile:async p=>set({...get(),profile:p}),deleteDream:async id=>set({...get(),records:get().records.filter(x=>x.id!==id)}),deleteDiary:async()=>{},signOut:async()=>{}};`,
    }),
  );
  await context.route("**/api/**", async (r) => {
    const u = new URL(r.request().url());
    try {
      if (u.pathname === "/api/account") return r.fulfill({ json: await billing.account("bob") });
      if (u.pathname === "/api/reflect") return r.fulfill({ json: { analysis: READING } });
      if (u.pathname === "/api/billing/sync")
        return r.fulfill({ json: { ...(await billing.account("bob")), synced: true } });
      let match, params = {};
      const endpoint = routes.find((x) => {
        if (x.method !== r.request().method()) return false;
        const names = [];
        const pattern = x.path.replace(/:([a-zA-Z]+)/g, (_, k) => (names.push(k), "([^/]+)"));
        match = new RegExp("^" + pattern + "$").exec(u.pathname);
        if (!match) return false;
        params = Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(match[i + 1])]));
        return true;
      });
      if (!endpoint) return r.fulfill({ status: 404, json: { code: "notFound" } });
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
      await r.fulfill({ status: e.status || 500, json: { code: e.code || e.message } });
    }
  });

  // 他の会員の投稿を今日の分として入れる。
  const publish = routes.find((x) => x.path === "/api/community/publish").fn;
  for (const p of FEED_POSTS)
    await publish(
      {
        body: { recordId: crypto.randomUUID(), title: p.title, text: p.text, alias: p.alias, typeId: p.typeId, characterSet: p.set, consent: true },
        get: () => "Bearer test-token-" + p.uid,
      },
      { json: () => {} },
    );
  return { store };
}

const ENTITLEMENT = (plan) =>
  plan === "free"
    ? { entitlements: { active: {} }, activeSubscriptions: [] }
    : {
        entitlements: { active: { [plan]: { productIdentifier: `com.doyle.yumetan.${plan}.yearly`, expirationDateMillis: Date.now() + 86400000 * 300 } } },
        activeSubscriptions: [`com.doyle.yumetan.${plan}.yearly`],
      };

async function newPage(browser, device, { plan }) {
  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: device.scale,
    isMobile: true,
    hasTouch: true,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    colorScheme: "dark",
    serviceWorkers: "block",
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  });
  await mockBackend(context, { plan });
  await context.addInitScript((info) => {
    window.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => "ios",
      Plugins: {
        Purchases: {
          configure: async () => {},
          logIn: async () => {},
          getCustomerInfo: async () => ({ customerInfo: info }),
          getOfferings: async () => ({ current: null, all: {} }),
        },
      },
    };
  }, ENTITLEMENT(plan));
  const page = await context.newPage();
  // セーフエリア: iOS の WebView と同じ値を env() に流す。
  const cdp = await context.newCDPSession(page);
  let safeArea = "cdp";
  try {
    await cdp.send("Emulation.setSafeAreaInsetsOverride", {
      insets: { top: device.insets.top, left: 0, bottom: device.insets.bottom, right: 0 },
    });
  } catch {
    safeArea = "css";
    await context.route(/\.css(\?.*)?$/, async (r) => {
      const res = await r.fetch();
      let css = await res.text();
      css = css
        .replace(/env\(safe-area-inset-top(,\s*0px)?\)/g, device.insets.top + "px")
        .replace(/env\(safe-area-inset-bottom(,\s*0px)?\)/g, device.insets.bottom + "px")
        .replace(/env\(safe-area-inset-(left|right)(,\s*0px)?\)/g, "0px");
      await r.fulfill({ response: res, body: css, headers: { ...res.headers(), "content-type": "text/css" } });
    });
  }
  page.on("pageerror", (e) => console.error("  page error:", e.message));
  return { context, page, safeArea };
}

const settle = async (page, ms = 700) => {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
};

async function onboard(page) {
  await page.goto(BASE + "/");
  for (let step = 0; step < 4; step++) {
    await page.locator(`[data-intro-step="${step}"]`).waitFor();
    await page.locator("[data-action=intro-next]").click();
  }
  const nickname = page.locator("#nickname");
  const signed = page.locator("[data-action=intro-continue]");
  const login = page.locator("[data-auth-provider]").first();
  await nickname.or(signed).or(login).first().waitFor();
  if (await signed.count()) await signed.click();
  else if (!(await nickname.count())) await login.click();
  await nickname.waitFor();
  await page.locator("#language").selectOption("ja");
  await nickname.fill("ユメ");
  await page.locator("#ageGroup").selectOption("20代");
  // 送信直後に別の処理（アカウント取得など）が走っているとクリックが無視される
  // ことがあるので、診断ページが出るまで送信を繰り返す。
  for (let i = 0; i < 8; i++) {
    await page.locator("#profile-form button[type=submit]").click();
    const quiz = await page
      .locator("#app[data-page=quiz]")
      .waitFor({ timeout: 2000 })
      .then(() => true, () => false);
    if (quiz) break;
  }
  for (const v of CHALLENGE_SHEET) {
    await page.locator(`[data-answer="${v}"]`).click();
    await page.locator("[data-action=quiz-next]").click();
  }
  await page.locator("[data-action=begin]").click();
  await page.locator("[data-action=record]").waitFor();
}

async function dumpFailure(page, label) {
  const file = path.join(outDir, `debug-${label}.png`);
  await page.screenshot({ path: file }).catch(() => {});
  console.error("  failed on page:", await page.locator("#app").getAttribute("data-page").catch(() => "?"));
  console.error("  text:", (await page.locator("#app").innerText().catch(() => "")).slice(0, 300).replace(/\n+/g, " | "));
  console.error("  see", file);
}

async function clearToast(page) {
  const toast = page.locator("#toast");
  await toast
    .evaluate((el) => new Promise((done) => {
      const deadline = Date.now() + 7000;
      const gone = () => !el.classList.contains("visible");
      const check = () => (gone() || Date.now() > deadline ? done() : setTimeout(check, 100));
      check();
    }))
    .catch(() => {});
  await toast.evaluate((el) => (el.style.visibility = "hidden")).catch(() => {});
}

async function shoot(page, file) {
  await settle(page);
  await clearToast(page);
  await page.screenshot({ path: file, fullPage: false });
  console.log("  wrote", path.relative(process.cwd(), file));
}

async function storeSet(browser, key, device) {
  const dir = path.join(outDir, key);
  fs.mkdirSync(dir, { recursive: true });
  const { context, page, safeArea } = await newPage(browser, device, { plan: "standard" });
  console.log(`${key} (${device.label}, safe area via ${safeArea})`);
  try {
    await onboard(page);
  } catch (e) {
    await dumpFailure(page, key);
    throw e;
  }
  await shoot(page, path.join(dir, "01-home.png"));

  await page.locator("nav [data-go=record]").click();
  await page.locator("#dream-text").fill(DREAM_TEXT);
  await page.locator("#dream-text").blur();
  await page.evaluate(() => {
    document.querySelector("#dream-text").scrollTop = 0;
    window.scrollTo(0, 0);
  });
  await shoot(page, path.join(dir, "02-record.png"));

  await page.locator("[data-action=diagnose]").click();
  await page.locator("#app[data-page=reading]").waitFor();
  await page.locator(".reading-card").waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shoot(page, path.join(dir, "03-reading.png"));
  const share = page.locator("#share-public");
  if (await share.count()) await share.check();
  await page.locator("[data-action=save-reading]").click();
  await settle(page);

  await page.locator("nav [data-go=community]").click();
  await page.locator(".feed-list .post, .feed-list article, .feed-list .card").first().waitFor({ timeout: 10000 }).catch(() => {});
  await page.evaluate(() => window.scrollTo(0, 0));
  await shoot(page, path.join(dir, "04-community.png"));

  await page.locator("#header [data-go=settings]").click();
  await page.locator("[data-go=plans]").first().click();
  await page.locator("#app[data-page=plans]").waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shoot(page, path.join(dir, "05-plans.png"));
  await context.close();
}

// サブスクリプション審査用: 無料会員から各プランの詳細を開き、価格・期間・
// 購読ボタン・App Store の注記が収まる位置で撮る。
async function subscriptionSet(browser, device) {
  const dir = path.join(outDir, "subscriptions");
  fs.mkdirSync(dir, { recursive: true });
  const { context, page } = await newPage(browser, device, { plan: "free" });
  console.log("subscriptions (free member, " + device.label + ")");
  await onboard(page);
  await page.locator("#header [data-go=settings]").click();
  await page.locator("[data-go=plans]").first().click();
  await page.locator("#app[data-page=plans]").waitFor();
  for (const plan of ["starter", "standard"]) {
    for (const cycle of ["monthly", "yearly"]) {
      if (!(await page.locator("#app[data-page=plan-details]").count())) {
        await page.locator(`.plan-links [data-plan=${plan}]`).click();
        await page.locator("#app[data-page=plan-details]").waitFor();
      } else if (!(await page.locator(`.plan-detail h1`).first().textContent()).includes(plan === "starter" ? "スターター" : "スタンダード")) {
        await page.goBack().catch(() => {});
        await page.locator("#app[data-page=plans]").waitFor().catch(async () => {
          await page.locator("#header [data-go=settings]").click();
          await page.locator("[data-go=plans]").first().click();
        });
        await page.locator(`.plan-links [data-plan=${plan}]`).click();
        await page.locator("#app[data-page=plan-details]").waitFor();
      }
      const picker = page.locator(`[data-social=${cycle}]`);
      if (await picker.count()) await picker.first().click();
      await settle(page, 400);
      // 下部のまとめカード（価格・購読ボタン・注記）を画面に入れる。
      const bottom = page.locator(".plan-detail-bottom");
      if (await bottom.count()) {
        await bottom.scrollIntoViewIfNeeded();
        await page.evaluate(() => window.scrollBy(0, 32));
      }
      await shoot(page, path.join(dir, `${plan}-${cycle}.png`));
    }
  }
  await context.close();
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const server = await ensureServer();
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  try {
    for (const [key, device] of Object.entries(DEVICES)) {
      if (only && only !== key && only !== "subscriptions") continue;
      await storeSet(browser, key, device);
    }
    if (!only || only === "subscriptions" || only === "iphone-6.9")
      await subscriptionSet(browser, DEVICES["iphone-6.9"]);
  } finally {
    await browser.close();
    server?.kill();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
