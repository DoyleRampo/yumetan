import { test, expect } from "@playwright/test";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
// The public site as Firebase Hosting serves it (dist-landing/, built by
// scripts/build-landing.mjs): every page renders, canonical and social tags
// point at the site's own origin, and GA4 receives the clicks that matter
// (App Store, support mail) with the stream's ID, but never the demo text.
const ROOT = path.resolve("dist-landing");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".xml": "application/xml",
  ".txt": "text/plain",
};
let server, origin;
test.beforeAll(async () => {
  execFileSync("node", ["scripts/build-landing.mjs"], { stdio: "ignore" });
  server = http.createServer((req, res) => {
    let file = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
    if (
      file.endsWith(path.sep) ||
      (fs.existsSync(file) && fs.statSync(file).isDirectory())
    )
      file = path.join(file, "index.html");
    if (!fs.existsSync(file)) {
      res.writeHead(404, { "Content-Type": TYPES[".html"] });
      res.end(fs.readFileSync(path.join(ROOT, "404.html")));
      return;
    }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
    });
    res.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(() => server?.close());
async function withTag(page) {
  // The site's config, with a test stream; the tag script itself is blocked.
  await page.route(/\/assets\/release-config\.mjs$/, (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: fs
        .readFileSync("landing/assets/release-config.mjs", "utf8")
        .replace(
          'GA4_MEASUREMENT_ID = ""',
          'GA4_MEASUREMENT_ID = "G-LP123456"',
        ),
    }),
  );
  const tag = [];
  await page.route(/googletagmanager\.com/, (route) => {
    tag.push(route.request().url());
    route.abort();
  });
  return tag;
}
const events = (page) =>
  page.evaluate(() =>
    (window.dataLayer || [])
      .map((e) => Array.from(e))
      .filter((e) => e[0] === "event")
      .map(([, name, params]) => ({ name, params })),
  );
test("the build carries every page, the legal texts, a sitemap and robots.txt on the site's origin", async () => {
  for (const file of [
    "index.html",
    "support/index.html",
    "privacy/index.html",
    "404.html",
    "legal/terms.html",
    "legal/privacy.html",
    "sitemap.xml",
    "robots.txt",
    "assets/analytics.js",
    "assets/og-image.jpg",
  ])
    expect(fs.existsSync(path.join(ROOT, file)), file).toBe(true);
  const home = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  expect(home).not.toContain("__SITE_URL__");
  expect(home).not.toContain("chatgpt.site");
  expect(home).toContain(
    '<link rel="canonical" href="https://yumetan-a31f0.web.app/">',
  );
  expect(home).toContain(
    'property="og:image" content="https://yumetan-a31f0.web.app/assets/og-image.jpg"',
  );
  expect(home).toContain('"@type":"MobileApplication"');
  const sitemap = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
  expect(sitemap).toContain("<loc>https://yumetan-a31f0.web.app/</loc>");
  expect(sitemap).toContain(
    "<loc>https://yumetan-a31f0.web.app/support/</loc>",
  );
  expect(sitemap).not.toContain("404");
  expect(fs.readFileSync(path.join(ROOT, "robots.txt"), "utf8")).toContain(
    "Sitemap: https://yumetan-a31f0.web.app/sitemap.xml",
  );
});
test("the top page renders, and store, support and FAQ interactions reach GA4 without the demo text", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const tag = await withTag(page);
  await page.goto(origin + "/");
  await expect(page.locator("h1")).toContainText("夢のつづきは");
  await expect(page.locator("#companion-name")).not.toBeEmpty();
  expect(tag[0]).toBe("https://www.googletagmanager.com/gtag/js?id=G-LP123456");
  // Links go nowhere here, only the data layer is read.
  await page.addInitScript(() => {});
  await page.evaluate(() =>
    document
      .querySelectorAll("a[href]")
      .forEach((a) => a.addEventListener("click", (e) => e.preventDefault())),
  );
  await page.locator(".hero-actions .install-button").click();
  await page.locator("footer a[href^='mailto:']").click();
  await page.locator("#faq details summary").first().click();
  await page.locator("[data-feature='sleep']").click();
  await page.locator("[data-sample]").first().click();
  await page.locator("#dream-text").fill("灯台の夢を見た。");
  await page.locator("#dream-form button[type=submit]").click();
  await expect(page.locator("#saved-dream")).toHaveText("灯台の夢を見た。");
  const sent = await events(page);
  const names = sent.map((e) => e.name);
  expect(names).toContain("app_store_click");
  expect(names).toContain("support_contact_click");
  expect(names).toContain("faq_open");
  expect(names).toContain("feature_tab");
  expect(names).toContain("demo_sample");
  expect(names).toContain("demo_submit");
  expect(names).toContain("section_view");
  const store = sent.find((e) => e.name === "app_store_click");
  expect(store.params.location).toBe("page");
  expect(store.params.page_name).toBe("home");
  expect(
    sent.find((e) => e.name === "support_contact_click").params.location,
  ).toBe("footer");
  expect(sent.find((e) => e.name === "demo_submit").params.text_length).toBe(
    "1-30",
  );
  const serialized = JSON.stringify(sent);
  expect(serialized).not.toContain("灯台");
  expect(serialized).not.toContain("doyle.rampo.dev");
  expect(errors).toEqual([]);
});
test("support, privacy, terms and a missing page work", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/support/");
  await expect(page.locator("h1")).toContainText("サポート");
  await expect(page.locator("nav a[href='/terms/']")).toBeVisible();
  await page.goto(origin + "/privacy/");
  await expect(page.locator("#permissions")).toContainText(
    "Google アナリティクス",
  );
  await page.goto(origin + "/legal/terms.html?lang=ja");
  await expect(page.locator("section[data-lang=ja] h1")).toContainText(
    "利用規約",
  );
  const missing = await page.goto(origin + "/nowhere/");
  expect(missing.status()).toBe(404);
  await expect(page.locator("h1")).toContainText("ページが見つかりません");
  // Without a measurement ID the pages never touch the data layer.
  expect(await page.evaluate(() => window.dataLayer)).toEqual([]);
  expect(errors).toEqual([]);
});
