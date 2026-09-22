import { test, expect } from "@playwright/test";
import { passTour } from "./helpers/introduction.js";
async function begin(page, lang = "ja", configured = false) {
  await page.route("**/firebase-config.js*", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body: configured
        ? "window.FIREBASE_CONFIG={apiKey:'test',projectId:'test'};"
        : "window.FIREBASE_CONFIG={};",
    }),
  );
  await page.goto("/");
  await expect(page.locator("[data-intro-step]")).toHaveAttribute(
    "data-intro-step",
    "0",
  );
  await page.locator("#language").selectOption(lang);
}
test("four-page introduction resumes, goes back, and leads to registration then the quiz", async ({
  page,
}) => {
  await begin(page);
  await expect(page.locator("#nav")).toBeHidden();
  await expect(page.locator("[data-action=intro-back]")).toBeDisabled();
  await page.locator("[data-action=intro-next]").click();
  await page.reload();
  await expect(page.locator("[data-intro-step]")).toHaveAttribute(
    "data-intro-step",
    "1",
  );
  await page.locator("[data-action=intro-back]").click();
  await expect(page.locator("[data-intro-step]")).toHaveAttribute(
    "data-intro-step",
    "0",
  );
  await passTour(page);
  // No Firebase configured: registration follows the tour directly.
  await expect(page.locator("#nickname")).toBeVisible();
  await expect(page.locator("main")).not.toContainText("タイプについて");
  await page.reload();
  await expect(page.locator("#nickname")).toBeVisible();
  await page.locator("#nickname").fill("ゆめ");
  await page.locator("#profile-form button[type=submit]").click();
  await expect(page.locator('[data-answer="2"]')).toBeVisible();
  await expect(page.locator("main")).not.toContainText("タイプについて");
  await page.reload();
  await expect(page.locator('[data-answer="2"]')).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("yumetan.v4.local")).profile.nickname,
    ),
  ).toBe("ゆめ");
});
test("skip jumps straight to the login wall and the type note appears only with the result", async ({
  page,
}) => {
  await page.route("**/cloud.js*", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body: `
 let uid='guest';const db={};const get=()=>db[uid]||{records:[],profile:null};
 window.YumetanCloud={state:{enabled:true},ready:Promise.resolve({enabled:true}),uid:()=>uid,isAnonymous:()=>uid==='guest',providers:()=>[],email:()=>uid==='guest'?'':'member@example.test',idToken:async()=>'test-token',loadOnce:async()=>get().records,loadProfile:async()=>get().profile,saveProfile:async profile=>{db[uid]={...get(),profile}},saveDream:async()=>{},deleteDream:async()=>{},signInProvider:async()=>{uid='member';},signOut:async()=>{uid='guest';}};
 `,
    }),
  );
  await page.route("**/api/account", (r) =>
    r.fulfill({ json: { plan: "free", usage: { day: {}, month: {} } } }),
  );
  await begin(page, "ja", true);
  await page.locator("[data-action=intro-skip]").click();
  await expect(page.locator("#app")).toHaveAttribute(
    "data-page",
    "welcome-login",
  );
  await page.reload();
  await expect(page.locator("#app")).toHaveAttribute(
    "data-page",
    "welcome-login",
  );
  await page.locator("[data-auth-provider=google]").click();
  await expect(page.locator("#nickname")).toBeVisible();
  await page.locator("#nickname").fill("ゆめ");
  await page.locator("#profile-form button[type=submit]").click();
  for (let i = 0; i < 16; i++) {
    await expect(page.locator("main")).not.toContainText("タイプについて");
    await page.locator('[data-answer="0"]').click();
    await page.locator("[data-action=quiz-next]").click();
  }
  await expect(page.locator("[data-action=begin]")).toBeVisible();
  await expect(page.locator(".type-note summary")).toContainText(
    "タイプについて",
  );
});
test("login cancellation keeps the login wall; successful login leads to registration", async ({
  page,
}) => {
  await page.route("**/cloud.js*", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body: `
 let uid='guest';const db={};const get=()=>db[uid]||{records:[],profile:null};
 window.YumetanCloud={state:{enabled:true},ready:Promise.resolve({enabled:true}),uid:()=>uid,isAnonymous:()=>uid==='guest',providers:()=>[],email:()=>uid==='guest'?'':'member@example.test',idToken:async()=>'test-token',loadOnce:async()=>get().records,loadProfile:async()=>get().profile,saveProfile:async profile=>{db[uid]={...get(),profile}},saveDream:async()=>{},deleteDream:async()=>{},signInProvider:async()=>{if(window.failLogin)throw {code:'auth/popup-closed-by-user'};uid='member';},signOut:async()=>{uid='guest';}};
 `,
    }),
  );
  await page.route("**/api/account", (r) =>
    r.fulfill({ json: { plan: "free", usage: { day: {}, month: {} } } }),
  );
  await begin(page, "ja", true);
  await passTour(page);
  await expect(page.locator("[data-action=guest]")).toHaveCount(0);
  await page.evaluate(() => (window.failLogin = true));
  await page.locator("[data-auth-provider=google]").click();
  await expect(page.locator("#toast")).toContainText("キャンセル");
  await expect(page.locator("#app")).toHaveAttribute(
    "data-page",
    "welcome-login",
  );
  await page.evaluate(() => (window.failLogin = false));
  await page.locator("[data-auth-provider=google]").click();
  await expect(page.locator("#nickname")).toBeVisible();
  await page.locator("#nickname").fill("ゆめ");
  await page.locator("#profile-form button[type=submit]").click();
  await expect(page.locator('[data-answer="2"]')).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("yumetan.v4.member")).profile.nickname,
    ),
  ).toBe("ゆめ");
});
for (const lang of ["ja", "en", "ko", "zh"])
  test(`introduction fits mobile and tablet layouts in ${lang}`, async ({
    page,
  }) => {
    await begin(page, lang);
    for (let step = 0; step < 4; step++) {
      for (const [width, height] of [
        [320, 568],
        [390, 844],
        [768, 1024],
        [844, 390],
      ]) {
        await page.setViewportSize({ width, height });
        await expect(page.locator("[data-action=intro-next]")).toBeInViewport();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        ).toBe(true);
      }
      await expect(page.locator(".intro-slide")).toHaveCSS(
        "animation-name",
        "intro-enter",
      );
      await page.locator("[data-action=intro-next]").click();
    }
    // Local-only build: registration follows the tour.
    await expect(page.locator("#app")).toHaveAttribute("data-page", "onboard");
    await expect(page.locator("main")).not.toContainText("undefined");
  });
test("reduced motion disables decorative introduction animations", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await begin(page);
  await expect(page.locator(".intro-slide")).toHaveCSS(
    "animation-name",
    "none",
  );
  await expect(page.locator(".intro-moon")).toHaveCSS("animation-name", "none");
});
