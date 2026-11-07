import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { createHash } from "node:crypto";
import {
  parseArgs,
  hostingConfig,
  collectFiles,
  deploy,
  API,
} from "../scripts/deploy-landing.mjs";
const quiet = () => {};
function build() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "landing-"));
  fs.mkdirSync(path.join(dir, "support"));
  fs.writeFileSync(path.join(dir, "index.html"), "<h1>top</h1>");
  fs.writeFileSync(path.join(dir, "support", "index.html"), "<h1>support</h1>");
  fs.writeFileSync(path.join(dir, ".hidden"), "x");
  return dir;
}
test("firebase.json's landing entry becomes the Hosting API version config", () => {
  const config = hostingConfig(
    JSON.parse(fs.readFileSync("firebase.json", "utf8")),
  );
  assert.equal(config.cleanUrls, true);
  assert.equal(config.trailingSlashBehavior, "ADD");
  assert.ok(
    config.redirects.some(
      (r) =>
        r.glob === "/terms/" &&
        r.location === "/legal/terms.html?lang=ja" &&
        r.statusCode === 301,
    ),
  );
  assert.ok(
    config.headers.some(
      (h) =>
        h.glob === "**" && h.headers["X-Content-Type-Options"] === "nosniff",
    ),
  );
  assert.deepEqual(hostingConfig({ hosting: { public: "x" } }).redirects, []);
});
test("files are gzipped and hashed, hidden files skipped", () => {
  const dir = build();
  const files = collectFiles(dir);
  assert.deepEqual(
    files.map((f) => f.path),
    ["/index.html", "/support/index.html"],
  );
  assert.equal(zlib.gunzipSync(files[0].gz).toString(), "<h1>top</h1>");
  assert.equal(
    files[0].hash,
    createHash("sha256").update(files[0].gz).digest("hex"),
  );
});
test("deploy creates a version, uploads only missing files, finalizes and releases", async () => {
  const dir = build();
  const calls = [];
  const files = collectFiles(dir);
  const fetch = async (url, init) => {
    calls.push({
      url,
      method: init.method,
      body: init.body,
      auth: init.headers.Authorization,
    });
    const json = (data, status = 200) => ({
      ok: status < 400,
      status,
      text: async () => JSON.stringify(data),
    });
    if (url === `${API}/sites/yumetan-a31f0` && init.method === "GET")
      return json({ error: { message: "not found" } }, 404);
    if (url.includes("/sites?siteId="))
      return json({ name: "sites/yumetan-a31f0" });
    if (url.endsWith("/versions"))
      return json({ name: "sites/yumetan-a31f0/versions/v1" });
    if (url.endsWith(":populateFiles"))
      return json({
        uploadRequiredHashes: [files[1].hash],
        uploadUrl:
          "https://upload-firebasehosting.googleapis.com/upload/sites/yumetan-a31f0/versions/v1/files",
      });
    if (url.includes("/upload/")) return json({});
    if (url.includes("?update_mask=status"))
      return json({ status: "FINALIZED" });
    if (url.includes("/releases?versionName="))
      return json({ name: "sites/yumetan-a31f0/releases/r1" });
    return json({ error: { message: `unexpected ${url}` } }, 500);
  };
  const result = await deploy({
    args: parseArgs(["--dir", dir]),
    token: "tok",
    fetch,
    log: quiet,
    config: { cleanUrls: true },
  });
  assert.deepEqual(result, {
    version: "sites/yumetan-a31f0/versions/v1",
    release: "sites/yumetan-a31f0/releases/r1",
    uploaded: 1,
    files: 2,
  });
  assert.ok(calls.every((c) => c.auth === "Bearer tok"));
  const upload = calls.find((c) => c.url.includes("/upload/"));
  assert.ok(upload.url.endsWith("/files/" + files[1].hash));
  assert.equal(Buffer.compare(upload.body, files[1].gz), 0);
  const populate = JSON.parse(
    calls.find((c) => c.url.endsWith(":populateFiles")).body,
  );
  assert.deepEqual(Object.keys(populate.files), [
    "/index.html",
    "/support/index.html",
  ]);
  const version = JSON.parse(
    calls.find((c) => c.url.endsWith("/versions")).body,
  );
  assert.deepEqual(version.config, { cleanUrls: true });
  assert.ok(
    calls.findIndex((c) => c.url.includes("update_mask")) <
      calls.findIndex((c) => c.url.includes("/releases")),
  );
  // Dry run touches nothing.
  const before = calls.length;
  const dry = await deploy({
    args: parseArgs(["--dir", dir, "--dry-run"]),
    token: "",
    fetch,
    log: quiet,
    config: {},
  });
  assert.deepEqual(dry, { dryRun: true, files: 2 });
  assert.equal(calls.length, before);
  await assert.rejects(
    deploy({
      args: parseArgs([
        "--dir",
        fs.mkdtempSync(path.join(os.tmpdir(), "empty-")),
      ]),
      token: "tok",
      fetch,
      log: quiet,
      config: {},
    }),
    /index\.html/,
  );
});
