import { test, expect } from "@playwright/test";
import { QUESTIONS } from "../../public/core/diagnosis.js";
import { passTour, registerAndQuiz } from "./helpers/introduction.js";
async function begin(page, lang = "ja", configured = false) {
  await page.route("**/firebase-config.js*", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body: configured
        ? "window.FIREBASE_CONFIG={apiKey:'test',projectId:'test'};"
        : "window.FIREBASE_CONFIG={};",
    }),
  );
  await page.addInitScript((language) => {
    if (!localStorage.getItem("yumetan.v4.options"))
      localStorage.setItem("yumetan.v4.options", JSON.stringify({ language }));
  }, lang);
  await page.goto("/");
  await expect(page.locator("[data-intro-step]")).toHaveAttribute(
    "data-intro-step",
    "0",
  );
  await expect(page.locator("#language")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
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
// Login and the account's cloud copy survive a reload, as with Firebase.
const CLOUD_STUB = `
 let uid=localStorage.getItem('ob.uid')||'guest';
 const get=()=>JSON.parse(localStorage.getItem('ob.db.'+uid)||'{"records":[],"profile":null}');
 const set=value=>localStorage.setItem('ob.db.'+uid,JSON.stringify(value));
 const become=next=>{uid=next;localStorage.setItem('ob.uid',uid);};
 window.YumetanCloud={state:{enabled:true},ready:Promise.resolve({enabled:true}),uid:()=>uid,isAnonymous:()=>uid==='guest',providers:()=>[],email:()=>uid==='guest'?'':'member@example.test',idToken:async()=>'test-token',loadOnce:async()=>get().records,loadProfile:async()=>get().profile,saveProfile:async profile=>set({...get(),profile}),saveDream:async()=>{},deleteDream:async()=>{},signInProvider:async()=>{if(window.failLogin)throw {code:'auth/popup-closed-by-user'};become('member');},signOut:async()=>{become('guest');}};
 `;
async function configured(page) {
  await page.route("**/cloud.js*", (r) =>
    r.fulfill({ contentType: "text/javascript", body: CLOUD_STUB }),
  );
  await page.route("**/api/account", (r) =>
    r.fulfill({ json: { plan: "free", usage: { day: {}, month: {} } } }),
  );
  await begin(page, "ja", true);
}
test("skip leads to registration and the quiz; the result asks for an account, then a new member sees the plans once", async ({
  page,
}) => {
  await configured(page);
  await page.locator("[data-action=intro-skip]").click();
  await expect(page.locator("#app")).toHaveAttribute("data-page", "onboard");
  await expect(page.locator("[data-auth-provider]")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("#app")).toHaveAttribute("data-page", "onboard");
  await page.locator("#nickname").fill("ゆめ");
  await page.locator("#profile-form button[type=submit]").click();
  for (let i = 0; i < QUESTIONS.length; i++) {
    await expect(page.locator("main")).not.toContainText("タイプについて");
    await page.locator('[data-answer="0"]').click();
    await page.locator("[data-action=quiz-next]").click();
  }
  // The result: the type note appears only here, and the button leads to the
  // account step (no tab bar or settings yet).
  await expect(page.locator("[data-action=begin]")).toHaveText(
    "登録・ログインしてはじめる",
  );
  await expect(page.locator(".type-note summary")).toContainText(
    "タイプについて",
  );
  await expect(page.locator("#nav")).toBeHidden();
  await expect(page.locator("#header [data-go=settings]")).toHaveCount(0);
  await page.locator("[data-action=begin]").click();
  await expect(page.locator("#app")).toHaveAttribute(
    "data-page",
    "welcome-login",
  );
  await expect(page.locator("#nickname")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("#app")).toHaveAttribute(
    "data-page",
    "welcome-login",
  );
  // A brand-new account takes the guest's profile and answers over, and is
  // shown the paid plans once: the overview, then Starter and Standard.
  await page.locator("[data-auth-provider=google]").click();
  await expect(page.locator("#app")).toHaveAttribute("data-page", "plan-offer");
  await expect(page.locator("[data-offer-step=intro]")).toBeVisible();
  await expect(page.locator("main")).toContainText("夢の世界を、もっと深く");
  await expect(page.locator("main")).toContainText("¥490");
  await expect(page.locator("main")).toContainText("¥980");
  await expect(page.locator("main")).toContainText("自動更新");
  await expect(page.locator("[data-social=offer-choose]")).toHaveText(
    "プランに登録する",
  );
  await expect(page.locator("[data-social=offer-free]")).toHaveText(
    "無料ではじめる",
  );
  await expect(page.locator("#nav")).toBeHidden();
  await expect(page.locator("main")).not.toContainText("undefined");
  await page.locator("[data-social=offer-choose]").click();
  await expect(page.locator("[data-offer-step=choose]")).toBeVisible();
  await expect(page.locator("[data-offer-plan=starter] h2")).toHaveText(
    "スターター",
  );
  await expect(page.locator("[data-offer-plan=standard] h2")).toHaveText(
    "スタンダード",
  );
  await expect(
    page.locator("[data-social=checkout][data-plan=starter]"),
  ).toBeVisible();
  await expect(
    page.locator("[data-social=checkout][data-plan=standard]"),
  ).toBeVisible();
  // On the web the store purchase stays disabled, with the reason.
  await expect(
    page.locator("[data-social=checkout][data-plan=starter]"),
  ).toBeDisabled();
  await expect(page.locator("main")).toContainText("iOSアプリ内で");
  await page.locator("[data-social=yearly]").click();
  await expect(page.locator("[data-offer-plan=starter]")).toContainText(
    "¥4,900",
  );
  await page.locator("[data-social=offer-back]").click();
  await expect(page.locator("[data-offer-step=intro]")).toBeVisible();
  // The offer waits through a reload until it is answered.
  await page.reload();
  await expect(page.locator("#app")).toHaveAttribute("data-page", "plan-offer");
  await page.locator("[data-social=offer-free]").click();
  await expect(page.locator("#app")).toHaveAttribute("data-page", "home");
  await expect(page.locator("main")).toContainText("ゆめ");
  await expect(page.locator("#nav")).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("yumetan.v4.member")).profile.nickname,
    ),
  ).toBe("ゆめ");
  // Answered: neither a reload nor signing out and back in shows it again.
  await page.reload();
  await expect(page.locator("#app")).toHaveAttribute("data-page", "home");
  await page.locator("#header [data-go=settings]").click();
  await page.locator("[data-action=signout]").click();
  await expect(page.locator("#app")).toHaveAttribute(
    "data-page",
    "welcome-login",
  );
  await page.locator("[data-auth-provider=google]").click();
  await expect(page.locator("#app")).toHaveAttribute("data-page", "home");
});
test("login cancellation keeps the login wall; a successful login carries the guest's profile into the plan offer", async ({
  page,
}) => {
  await configured(page);
  await passTour(page);
  await registerAndQuiz(page, { nickname: "ゆめ" });
  await page.locator("[data-action=begin]").click();
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
  await expect(page.locator("#app")).toHaveAttribute("data-page", "plan-offer");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("yumetan.v4.member")).profile.nickname,
    ),
  ).toBe("ゆめ");
  await page.locator("[data-social=offer-free]").click();
  await expect(page.locator("#app")).toHaveAttribute("data-page", "home");
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
    // Language choice remains at registration, with the saved preference intact.
    await expect(page.locator("#language")).toHaveValue(lang);
    await page.locator("#language").selectOption("en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
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
