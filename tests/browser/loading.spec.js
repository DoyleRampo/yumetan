import { test, expect } from "@playwright/test";

async function localConfig(page) {
  await page.route("**/firebase-config.js*", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body: "window.FIREBASE_CONFIG={};",
    }),
  );
}

test("launch animation is visible before JavaScript starts, including reduced motion", async ({
  page,
}) => {
  await localConfig(page);
  // Defer the real entry point while letting the document finish loading.
  // WebKit cannot capture a screenshot while a module network request is held.
  await page.route("**/app.js*", (r) =>
    r.request().url().includes("launch-test")
      ? r.continue()
      : r.fulfill({
          contentType: "text/javascript",
          body: "window.startApp=()=>import('./app.js?launch-test');",
        }),
  );
  await page.goto("/");
  const loader = page.locator(".launch-loading .dream-loading");
  await expect(loader).toBeVisible();
  await expect(loader).toContainText("夢の世界を準備しています");
  await expect(page.locator(".dream-loading__moon")).toHaveCSS(
    "animation-name",
    "dream-moon",
  );
  await page.screenshot({ path: "test-results/loading-launch.png" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".dream-loading__moon")).toHaveCSS(
    "animation-name",
    "none",
  );
  await expect(loader).toBeVisible();
  await page.evaluate(() => window.startApp());
  await expect(page.locator("[data-intro-step]")).toBeVisible();
  await expect(loader).toHaveCount(0);
});

test("a delayed login animates, clears on cancellation, and allows retry", async ({
  page,
}) => {
  await localConfig(page);
  await page.route("**/cloud.js*", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body: `
    window.YumetanCloud={state:{enabled:true},ready:Promise.resolve({enabled:true}),uid:()=> 'guest',isAnonymous:()=>true,providers:()=>[],loadOnce:async()=>[],loadProfile:async()=>null,signInProvider:()=>new Promise((_,reject)=>{window.cancelLogin=()=>reject({code:'auth/popup-closed-by-user'});})};
  `,
    }),
  );
  await page.goto("/");
  await page.locator("[data-action=intro-skip]").click();
  await page.locator("[data-auth-provider=google]").click();
  await expect(page.locator(".dream-loading-operation")).toBeVisible();
  await expect(page.locator("[data-auth-provider=google]")).toBeDisabled();
  await page.screenshot({ path: "test-results/loading-login.png" });
  await page.evaluate(() => window.cancelLogin());
  await expect(page.locator("#toast")).toContainText("キャンセル");
  await expect(page.locator(".dream-loading-operation")).toHaveCount(0);
  await expect(page.locator("[data-auth-provider=google]")).toBeEnabled();
  await page.locator("[data-auth-provider=google]").click();
  await expect(page.locator(".dream-loading-operation")).toBeVisible();
  await page.evaluate(() => window.cancelLogin());
  await expect(page.locator(".dream-loading-operation")).toHaveCount(0);
});

test("a failed late cloud connection stops animating and offers reconnect", async ({
  page,
}) => {
  await page.route("**/firebase-config.js*", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body: "window.FIREBASE_CONFIG={apiKey:'test'};",
    }),
  );
  await page.route("**/cloud.js*", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body: `
    const state={enabled:false};window.YumetanCloud={state,ready:new Promise(resolve=>window.failCloud=()=>{state.error='auth/network-request-failed';resolve(state);})};
  `,
    }),
  );
  await page.goto("/");
  await page.locator("[data-action=intro-skip]").click();
  await expect(
    page.locator("#account-sync-status .dream-loading"),
  ).toBeVisible();
  await page.evaluate(() => window.failCloud());
  await expect(page.locator("#account-sync-status .dream-loading")).toHaveCount(
    0,
  );
  await expect(page.locator("[data-action=auth-retry]")).toBeEnabled();
  await expect(page.locator("#account-sync-status")).toContainText(
    "auth/network-request-failed",
  );
});

test("browser sign-in shows an animation during bootstrap and an error when it fails", async ({
  page,
}) => {
  let fail;
  const held = new Promise((resolve) => (fail = resolve));
  await localConfig(page);
  await page.route("**/api/auth/bootstrap", async (r) => {
    await held;
    await r.fulfill({
      status: 503,
      json: { code: "auth/network-request-failed" },
    });
  });
  await page.goto("/auth.html#language=ja&id=test&browserKey=test");
  await expect(page.locator("#message .dream-loading")).toBeVisible();
  await expect(page.locator("#continue")).toBeHidden();
  fail();
  await expect(page.locator("#message .dream-loading")).toHaveCount(0);
  await expect(page.locator("#error")).not.toBeEmpty();
});

test("onboarding separates navigation and fits a small phone", async ({
  page,
}) => {
  await localConfig(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  await page.locator("[data-action=intro-next]").click();
  const back = page.locator("[data-action=intro-back]"),
    skip = page.locator("[data-action=intro-skip]"),
    next = page.locator("[data-action=intro-next]");
  await expect(back).toBeInViewport();
  await expect(skip).toBeInViewport();
  await expect(next).toBeInViewport();
  const [b, s, n] = await Promise.all([
    back.boundingBox(),
    skip.boundingBox(),
    next.boundingBox(),
  ]);
  expect(b.y + b.height).toBeLessThan(n.y);
  expect(s.y + s.height).toBeLessThan(n.y);
  expect(b.x + b.width).toBeLessThan(s.x);
  await page
    .locator(".intro-slide")
    .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  await page.screenshot({ path: "test-results/introduction-small.png" });
});

test("browser sign-in clears waiting on cancellation and successful handoff", async ({
  page,
}) => {
  await localConfig(page);
  await page.route("**/api/auth/bootstrap", (r) =>
    r.fulfill({ json: { provider: "google" } }),
  );
  await page.route("**/core/firebase-sdk.js", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body: `export async function loadFirebase(){return [{initializeApp:()=>({})},{initializeAuth:()=>({}),signOut:async()=>{}}]}`,
    }),
  );
  await page.route("**/core/auth-providers.js", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body: `export function providerLogin(){return new Promise((resolve,reject)=>{window.cancelSignIn=()=>reject({code:'auth/popup-closed-by-user'});window.finishSignIn=()=>resolve({user:{getIdToken:async()=> 'test-token'}});})}`,
    }),
  );
  await page.route("**/api/auth/complete", (r) =>
    r.fulfill({ json: { ok: true } }),
  );
  await page.goto("/auth.html#language=ja&id=test&browserKey=test");
  const button = page.locator("#continue"),
    loader = page.locator("#message .dream-loading");
  await expect(button).toBeEnabled();
  await expect(loader).toHaveCount(0);
  await button.click();
  await expect(loader).toBeVisible();
  await page.evaluate(() => window.cancelSignIn());
  await expect(loader).toHaveCount(0);
  await expect(button).toBeEnabled();
  await expect(page.locator("#error")).toContainText("キャンセル");
  await button.click();
  await expect(loader).toBeVisible();
  await page.evaluate(() => window.finishSignIn());
  await expect(loader).toHaveCount(0);
  await expect(button).toBeHidden();
  await expect(page.locator("#message")).toContainText("戻");
});
