// Assembles the public site (landing/) into dist-landing/ for Firebase Hosting:
//   - copies landing/ as it is;
//   - fills __SITE_URL__ in the pages with SITE_URL from landing/assets/release-config.mjs;
//   - copies public/legal/ (the Terms of Use and Privacy Policy the app links
//     to) to /legal/, so /terms/ and the in-app legal pages share one text;
//   - writes robots.txt and sitemap.xml for that origin.
// Usage: npm run landing:build   (firebase.json runs it before every hosting deploy)
import fs from "node:fs";
import path from "node:path";
import { SITE_URL } from "../landing/assets/release-config.mjs";
const site = String(SITE_URL || "").replace(/\/$/, "");
if (!/^https:\/\/[a-z0-9.-]+$/i.test(site)) {
  console.error(
    "landing/assets/release-config.mjs の SITE_URL は https://ドメイン の形で指定してください。",
  );
  process.exit(1);
}
const out = "dist-landing";
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync("landing", out, { recursive: true });
fs.cpSync(path.join("public", "legal"), path.join(out, "legal"), {
  recursive: true,
});
const pages = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (file.endsWith(".html")) {
      const html = fs
        .readFileSync(file, "utf8")
        .replaceAll("__SITE_URL__", site);
      fs.writeFileSync(file, html);
      pages.push(file);
    }
  }
}
walk(out);
const urlOf = (file) =>
  site +
  "/" +
  path
    .relative(out, file)
    .split(path.sep)
    .join("/")
    .replace(/index\.html$/, "")
    .replace(/\.html$/, "");
const listed = pages
  .filter((f) => !/404\.html$|\/legal\//.test(f))
  .map(urlOf)
  .sort((a, b) => a.length - b.length || a.localeCompare(b));
const today = new Date().toISOString().slice(0, 10);
fs.writeFileSync(
  path.join(out, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${listed
    .map(
      (url) =>
        `  <url><loc>${url}</loc><lastmod>${today}</lastmod><changefreq>${url === site + "/" ? "weekly" : "monthly"}</changefreq><priority>${url === site + "/" ? "1.0" : "0.6"}</priority></url>`,
    )
    .join("\n")}\n</urlset>\n`,
);
fs.writeFileSync(
  path.join(out, "robots.txt"),
  `User-agent: *\nAllow: /\nSitemap: ${site}/sitemap.xml\n`,
);
const size = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .reduce(
      (n, e) =>
        n +
        (e.isDirectory()
          ? size(path.join(dir, e.name))
          : fs.statSync(path.join(dir, e.name)).size),
      0,
    );
console.log(
  `${out}/ を作成しました（${site}、ページ ${listed.length} 件、${(size(out) / 1024 / 1024).toFixed(1)} MB）`,
);
for (const url of listed) console.log("  " + url);
