// Firebase の Web SDK（ESM バンドル）を public/vendor/firebase/ に取り込む。
// アプリ起動時に gstatic.com からダウンロードしなくて済むよう、同じファイルを同一オリジンから配信する。
// 使い方: node scripts/vendor-firebase.mjs   （バージョンは public/core/firebase-sdk.js の FIREBASE_SDK_VERSION）
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FIREBASE_SDK_VERSION as V } from "../public/core/firebase-sdk.js";
const files = ["firebase-app.js", "firebase-auth.js", "firebase-firestore.js"];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "firebase-sdk-"));
const tgz = execSync(`npm pack firebase@${V} --silent`, { cwd: tmp })
  .toString()
  .trim();
execSync(`tar xzf ${tgz}`, { cwd: tmp });
const out = path.join("public", "vendor", "firebase");
fs.mkdirSync(out, { recursive: true });
for (const file of files) {
  const source = fs.readFileSync(path.join(tmp, "package", file), "utf8");
  // The auth/firestore bundles import the app bundle from the CDN; keep everything local.
  const local = source.replaceAll(
    `https://www.gstatic.com/firebasejs/${V}/firebase-app.js`,
    "./firebase-app.js",
  );
  if (/gstatic\.com\/firebasejs/.test(local))
    throw new Error(`${file} still references the CDN`);
  fs.writeFileSync(path.join(out, file), local);
  console.log(`${out}/${file} (${(local.length / 1024).toFixed(0)} KB)`);
}
fs.rmSync(tmp, { recursive: true, force: true });
