import { expect } from "@playwright/test";
import { QUESTIONS } from "../../../public/core/diagnosis.js";
// Click through the four introduction pages; registration follows (first
// run order: tour → registration → quiz → login → plan offer → home).
export async function passTour(page) {
  for (let step = 0; step < 4; step++) {
    await expect(page.locator("[data-intro-step]")).toHaveAttribute(
      "data-intro-step",
      String(step),
    );
    await page.locator("[data-action=intro-next]").click();
  }
}
// Reach the registration form: the tour, then the form.
export async function finishIntroduction(page) {
  await passTour(page);
  await expect(page.locator("#nickname")).toBeVisible();
}
// Fill the registration form and answer every question with 0 (never / first
// scene / neutral); the type itself is not under test here. Ends on the result.
export async function registerAndQuiz(
  page,
  { nickname = "ゆめ", language = null, ageGroup = null } = {},
) {
  await expect(page.locator("#nickname")).toBeVisible();
  if (language) await page.locator("#language").selectOption(language);
  if (ageGroup) await page.locator("#ageGroup").selectOption(ageGroup);
  await page.locator("#nickname").fill(nickname);
  await page.locator("#profile-form button[type=submit]").click();
  for (let i = 0; i < QUESTIONS.length; i++) {
    await page.locator('[data-answer="0"]').click();
    await page.locator("[data-action=quiz-next]").click();
  }
  await expect(page.locator("[data-action=begin]")).toBeVisible();
}
// A guest who has registered and answered the quiz: tour, form, quiz, then
// "begin" opens the login wall whenever an account is still needed.
export async function reachLogin(page, options) {
  await finishIntroduction(page);
  await registerAndQuiz(page, options);
  await page.locator("[data-action=begin]").click();
  await expect(page.locator("#app")).toHaveAttribute(
    "data-page",
    "welcome-login",
  );
}
// After the result (or a login): the paid-plan offer, when it is shown, is
// answered with "start for free"; the home page follows either way.
export async function startFree(page) {
  const offer = page.locator("[data-social=offer-free]"),
    home = page.locator("[data-action=record]");
  await expect(offer.or(home).first()).toBeVisible();
  if (await offer.count()) await offer.click();
  await expect(home).toBeVisible();
}
// Opens the app at the login wall: a guest who registered and answered the
// quiz earlier (saved on the device), ready to sign in.
export async function seedGuestAtLogin(page, language = "ja") {
  await page.addInitScript(
    ({ language, answers }) => {
      if (!localStorage.getItem("yumetan.v4.local"))
        localStorage.setItem(
          "yumetan.v4.local",
          JSON.stringify({
            version: 4,
            profile: {
              nickname: "ゆめ",
              ageGroup: "20代",
              language,
              typeAnswers: answers,
              typeVersion: 2,
              updatedAt: "2026-09-01T00:00:00Z",
            },
            records: [],
            deleted: [],
          }),
        );
      if (!localStorage.getItem("yumetan.v4.options"))
        localStorage.setItem(
          "yumetan.v4.options",
          JSON.stringify({
            language,
            introduction: { phase: "login", step: 3 },
          }),
        );
    },
    { language, answers: QUESTIONS.map(() => 0) },
  );
}
