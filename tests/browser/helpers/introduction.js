import { expect } from "@playwright/test";
// Click through the four introduction pages; the app then shows either the
// login wall (Firebase configured) or registration (local-only builds).
export async function passTour(page) {
  for (let step = 0; step < 4; step++) {
    await expect(page.locator("[data-intro-step]")).toHaveAttribute(
      "data-intro-step",
      String(step),
    );
    await page.locator("[data-action=intro-next]").click();
  }
}
// Reach the registration form: tour, then login (or "continue" when already
// signed in) whenever the login wall is shown.
export async function finishIntroduction(page, provider = "google") {
  await passTour(page);
  const nickname = page.locator("#nickname"),
    login = page.locator(`[data-auth-provider=${provider}]`),
    signed = page.locator("[data-action=intro-continue]");
  await expect(nickname.or(login).or(signed).first()).toBeVisible();
  if (await signed.count()) await signed.click();
  else if (await login.count()) await login.click();
  await expect(nickname).toBeVisible();
}
