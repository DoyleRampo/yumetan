#!/usr/bin/env node
// Publishes dist-landing/ to Firebase Hosting through the Hosting REST API,
// with nothing but an OAuth access token: no `firebase login`, no CLI session.
// For the usual `firebase deploy` flow use `npm run landing:deploy` instead.
//
//   node scripts/build-landing.mjs
//   FIREBASE_ACCESS_TOKEN=… node scripts/deploy-landing.mjs [--site yumetan-a31f0] [--dry-run]
//
// The token needs the https://www.googleapis.com/auth/cloud-platform (or
// firebase.hosting) scope and an account that may deploy to the project:
//   gcloud auth print-access-token
// or https://developers.google.com/oauthplayground/ with that scope. Behind a
// proxy that injects the Authorization header, any placeholder token works.
//
// Steps (https://firebase.google.com/docs/hosting/api-deploy): create a
// version carrying firebase.json's hosting config → tell Hosting the SHA-256
// of every gzipped file → upload the ones it does not have → finalize → release.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createHash } from "node:crypto";
export const API = "https://firebasehosting.googleapis.com/v1beta1";
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};
export function parseArgs(argv) {
  const args = { site: "yumetan-a31f0", dir: "dist-landing", dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--site") args.site = String(argv[++i] || "");
    else if (a.startsWith("--site=")) args.site = a.slice(7);
    else if (a === "--dir") args.dir = String(argv[++i] || "");
    else if (a === "--dry-run") args.dryRun = true;
    else throw new Error(`Unknown option: ${a}`);
  }
  if (!/^[a-z0-9-]+$/.test(args.site))
    throw new Error("--site must be a Hosting site ID");
  return args;
}
// The hosting entry of firebase.json, as the Hosting API's version config.
export function hostingConfig(json) {
  const list = Array.isArray(json.hosting) ? json.hosting : [json.hosting];
  const entry = list.find((h) => h?.target === "landing") || list[0] || {};
  const glob = (source) => ({ glob: source });
  return {
    headers: (entry.headers || []).map((h) => ({
      ...glob(h.source),
      headers: Object.fromEntries(
        (h.headers || []).map((x) => [x.key, x.value]),
      ),
    })),
    redirects: (entry.redirects || []).map((r) => ({
      ...glob(r.source),
      location: r.destination,
      statusCode: r.type || 301,
    })),
    rewrites: (entry.rewrites || []).map((r) => ({
      ...glob(r.source),
      ...(r.destination ? { path: r.destination } : {}),
    })),
    cleanUrls: Boolean(entry.cleanUrls),
    trailingSlashBehavior:
      entry.trailingSlash === true
        ? "ADD"
        : entry.trailingSlash === false
          ? "REMOVE"
          : "TRAILING_SLASH_BEHAVIOR_UNSPECIFIED",
  };
}
// Every file of the build: its site path, gzipped bytes and their SHA-256.
export function collectFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const file = path.join(d, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (!entry.name.startsWith(".")) {
        const gz = zlib.gzipSync(fs.readFileSync(file), { level: 9 });
        out.push({
          path: "/" + path.relative(dir, file).split(path.sep).join("/"),
          gz,
          hash: createHash("sha256").update(gz).digest("hex"),
        });
      }
    }
  };
  walk(dir);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}
export async function deploy({
  args,
  token,
  fetch = globalThis.fetch,
  log = console.log,
  config = hostingConfig(JSON.parse(fs.readFileSync("firebase.json", "utf8"))),
}) {
  const files = collectFiles(args.dir);
  if (!files.some((f) => f.path === "/index.html"))
    throw new Error(
      `${args.dir}/index.html がありません。先に node scripts/build-landing.mjs を実行してください。`,
    );
  const total = files.reduce((n, f) => n + f.gz.length, 0);
  log(
    `${args.dir}/: ${files.length} ファイル（gzip ${(total / 1024).toFixed(0)} KB）→ sites/${args.site}`,
  );
  if (args.dryRun) {
    for (const f of files) log(`  ${f.path} ${f.hash.slice(0, 12)}`);
    return { dryRun: true, files: files.length };
  }
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  async function api(method, url, body, raw = false) {
    const response = await fetch(url, {
      method,
      headers: raw
        ? { ...headers, "Content-Type": "application/octet-stream" }
        : headers,
      body: raw ? body : body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    if (!response.ok) {
      let message = text.slice(0, 400);
      try {
        message = JSON.parse(text).error?.message || message;
      } catch {}
      throw new Error(
        `${method} ${url.replace(API, "")} → ${response.status}: ${message}`,
      );
    }
    return text ? JSON.parse(text) : {};
  }
  // The site. Hosting's default site shares the project's ID; a project that
  // never used Hosting may not have it yet.
  const siteUrl = `${API}/sites/${args.site}`;
  try {
    const site = await api("GET", siteUrl);
    log(`サイト: ${site.defaultUrl || site.name}`);
  } catch (e) {
    if (!/404/.test(e.message)) throw e;
    log("サイトが未作成のため作成します");
    await api(
      "POST",
      `${API}/projects/${args.site}/sites?siteId=${args.site}`,
      {},
    );
  }
  const version = await api("POST", `${siteUrl}/versions`, { config });
  log(`バージョン: ${version.name}`);
  const populate = await api("POST", `${API}/${version.name}:populateFiles`, {
    files: Object.fromEntries(files.map((f) => [f.path, f.hash])),
  });
  const needed = new Set(populate.uploadRequiredHashes || []);
  log(`アップロード: ${needed.size} / ${files.length} ファイル（残りは既存）`);
  for (const f of files)
    if (needed.has(f.hash)) {
      await api("POST", `${populate.uploadUrl}/${f.hash}`, f.gz, true);
      log(`  ↑ ${f.path}`);
    }
  await api("PATCH", `${API}/${version.name}?update_mask=status`, {
    status: "FINALIZED",
  });
  const release = await api(
    "POST",
    `${siteUrl}/releases?versionName=${version.name}`,
    {},
  );
  log(`公開しました: ${release.name}`);
  return {
    version: version.name,
    release: release.name,
    uploaded: needed.size,
    files: files.length,
  };
}
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token =
    process.env.FIREBASE_ACCESS_TOKEN || process.env.GA4_ACCESS_TOKEN || "";
  if (!token && !args.dryRun)
    throw new Error(
      "FIREBASE_ACCESS_TOKEN（cloud-platform スコープのアクセストークン）を指定してください。",
    );
  const result = await deploy({ args, token });
  if (!result.dryRun) {
    const { SITE_URL } = await import("../landing/assets/release-config.mjs");
    console.log(`https://${args.site}.web.app/ （canonical: ${SITE_URL}/）`);
  }
}
if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
)
  main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
