import { test, expect } from "@playwright/test";
import { QUESTIONS } from "../../public/core/diagnosis.js";
import {
  passTour,
  registerAndQuiz,
  answerQuestion,
} from "./helpers/introduction.js";
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
    await answerQuestion(page, 0);
  }
  // The result: the type note appears only here, and the button leads to the
  // account step (no tab bar or settings yet).
  await expect(page.locator("[data-action=begin]")).toHaveText(
    "登録・ログインしてはじめる",
  );
  // The type note opens as a tip on the result; the evidence in a sheet.
  await expect(page.locator("#tip")).toHaveClass(/visible/);
  await page.locator("#tip [data-tip-close]").click();
  await expect(page.locator("#tip")).not.toHaveClass(/visible/);
  await expect(page.locator(".rationale")).toBeHidden();
  await page.locator("[data-sheet-open=why]").click();
  await expect(page.locator(".rationale")).toBeVisible();
  await page.locator('[data-sheet="why"] .popup-close').click();
  await expect(page.locator(".rationale")).toBeHidden();
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
test("the quiz sits mid-screen with short answers, and a character cheers once at halfway", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await begin(page);
  await passTour(page);
  await page.locator("#nickname").fill("ゆめ");
  await page.locator("#profile-form button[type=submit]").click();
  const half = Math.ceil(QUESTIONS.length / 2);
  for (let i = 0; i < QUESTIONS.length; i++) {
    await expect(page.locator("progress")).toHaveAttribute(
      "value",
      String(i + 1),
    );
    // Every answer is a few words, and the answers sit around the middle of
    // the screen, never squeezed against the bottom edge.
    const labels = await page
      .locator(".quiz-answers .quiz-label")
      .allTextContents();
    expect(
      Math.max(...labels.map((l) => [...l].length)),
      QUESTIONS[i].id,
    ).toBeLessThanOrEqual(10);
    const box = await page.locator(".quiz-answers").boundingBox();
    expect(box.y + box.height, QUESTIONS[i].id).toBeLessThan(844 * 0.85);
    expect(box.y, QUESTIONS[i].id).toBeGreaterThan(844 * 0.35);
    await answerQuestion(page, 0);
    if (i === half - 1) {
      const cheer = page.locator(".quiz-cheer");
      await expect(cheer).toBeVisible();
      await expect(cheer).toContainText("あと半分だよ！");
      // It leaves by itself, quickly.
      await expect(cheer).toHaveCount(0, { timeout: 3000 });
      // Stepping back over the halfway mark does not bring it back.
      await page.locator("[data-action=quiz-back]").click();
      await page.locator("[data-action=quiz-next]").click();
      await expect(page.locator("progress")).toHaveAttribute(
        "value",
        String(half + 1),
      );
      await page.waitForTimeout(300);
      await expect(cheer).toHaveCount(0);
    }
  }
  await expect(page.locator("[data-action=begin]")).toBeVisible();
});
test("the result's evidence is one page that scrolls, and pulling its bar down closes it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await begin(page);
  await passTour(page);
  await registerAndQuiz(page);
  await page.locator("[data-sheet-open=why]").click();
  const why = page.locator('[data-sheet="why"]'),
    body = why.locator(".sheet-body");
  await expect(why).toBeVisible();
  // No panels to page through: everything is in one scrolling column.
  await expect(why.locator(".panel-controls")).toHaveCount(0);
  await expect(body).not.toHaveClass(/paginated/);
  expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
    true,
  );
  await page.screenshot({ path: "test-results/result-why-top.png" });
  await body.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(why.locator(".lore")).toBeInViewport();
  await page.screenshot({ path: "test-results/result-why-bottom.png" });
  // A short pull springs back; a long one puts the sheet away.
  const grip = await why.locator(".sheet-grip").boundingBox();
  const pull = async (distance) => {
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 5; i++)
      await page.mouse.move(
        grip.x + grip.width / 2,
        grip.y + grip.height / 2 + (distance * i) / 5,
      );
    await page.mouse.up();
  };
  await pull(30);
  await page.waitForTimeout(400);
  await expect(why).toBeVisible();
  await pull(260);
  await expect(why).toBeHidden();
  await expect(page.locator("[data-action=begin]")).toBeVisible();
  // It opens again whole.
  await page.locator("[data-sheet-open=why]").click();
  await expect(why).toBeVisible();
  await expect(why.locator(".rationale")).toBeInViewport();
});
