import { test, expect } from "@playwright/test";
// A new member right after the first quiz result: signed in, on Free, with
// the plan offer still to answer.
async function offer(page) {
  await page.route("**/firebase-config.js*", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body: "window.FIREBASE_CONFIG={apiKey:'test',projectId:'test'};",
    }),
  );
  await page.route("**/cloud.js*", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body: "window.YumetanCloud={ready:Promise.resolve({enabled:true}),state:{enabled:true},uid:()=>'member',isAnonymous:()=>false,providers:()=>['google.com'],email:()=>'m@example.test',idToken:async()=>'t',loadOnce:async()=>[],loadProfile:async()=>null,saveProfile:async()=>{},saveDream:async()=>{},deleteDream:async()=>{}};",
    }),
  );
  await page.route("**/api/account", (r) =>
    r.fulfill({ json: { plan: "free", usage: { day: {}, month: {} } } }),
  );
  await page.addInitScript(() => {
    if (localStorage.getItem("yumetan.v4.member")) return;
    localStorage.setItem(
      "yumetan.v4.options",
      JSON.stringify({
        language: "ja",
        introduction: { phase: "plan", step: 3 },
        tipsSeen: ["plan-offer"],
      }),
    );
    localStorage.setItem(
      "yumetan.v4.active",
      JSON.stringify("yumetan.v4.member"),
    );
    localStorage.setItem("yumetan.v4.cloud-adopted", "true");
    localStorage.setItem(
      "yumetan.v4.member",
      JSON.stringify({
        version: 4,
        profile: {
          nickname: "ゆめ",
          ageGroup: "20代",
          language: "ja",
          typeAnswers: Array.from({ length: 24 }, (_, i) => (i < 12 ? 1 : 0)),
          typeVersion: 2,
        },
        records: [],
        deleted: [],
      }),
    );
  });
  await page.goto("/");
  await expect(page.locator("#app")).toHaveAttribute("data-page", "plan-offer");
}
// The purchase buttons, the way out and the renewal terms are all on screen,
// with nothing to scroll or page through.
async function allOnScreen(page, selectors) {
  await expect(page.locator(".stage-pager")).toBeHidden();
  for (const selector of selectors)
    for (const el of await page.locator(selector).all())
      await expect(el, selector).toBeInViewport({ ratio: 1 });
}
for (const [width, height] of [
  [320, 568],
  [375, 667],
  [390, 844],
  [430, 932],
  [844, 390],
])
  test(`the plan offer's purchase buttons need no scrolling at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await offer(page);
    await allOnScreen(page, [
      "[data-social=offer-choose]",
      "[data-social=offer-free]",
      ".legal-note",
    ]);
    await page.locator("[data-social=offer-choose]").click();
    await expect(page.locator("[data-offer-step=choose]")).toBeVisible();
    await allOnScreen(page, [
      "[data-social=checkout][data-plan=starter]",
      "[data-social=checkout][data-plan=standard]",
      ".offer-buy .purchase-summary",
      "[data-social=offer-free]",
      ".legal-note",
    ]);
    await page.locator("[data-social=yearly]").click();
    await expect(page.locator("[data-offer-plan=starter]")).toContainText(
      "¥4,900",
    );
    await allOnScreen(page, ["[data-social=checkout][data-plan=standard]"]);
  });
