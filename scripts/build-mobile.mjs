// ネイティブアプリ用に public/ を dist/ にコピーし、接続先サーバーURLを埋め込む
// 使い方: API_URL=https://your-server.example.com node scripts/build-mobile.mjs
import fs from "node:fs";
import path from "node:path";

const apiUrl = (process.env.API_URL || "").replace(/\/$/, "");
if (!apiUrl) {
  console.error("API_URL（公開したサーバーのURL）を指定してください。例: API_URL=https://yumetan.onrender.com npm run mobile:build");
  process.exit(1);
}
// RevenueCat の公開SDKキー（appl_… / goog_…）。秘密キー（sk_…）はサーバーの .env にだけ置く。
// 未指定なら RevenueCat の Test Store キー（ダッシュボードの「Install the SDK」に表示された値）で動作確認できる。
const TEST_STORE_KEY = "test_HuDNDZoAPYBRaVzdtMaOGFQMAXx";
const revenueCat = {
  ios: process.env.REVENUECAT_IOS_API_KEY || process.env.REVENUECAT_API_KEY || TEST_STORE_KEY,
  android: process.env.REVENUECAT_ANDROID_API_KEY || process.env.REVENUECAT_API_KEY || TEST_STORE_KEY,
};
const testStore = Object.values(revenueCat).some((key) => key.startsWith("test_"));
fs.rmSync("dist", { recursive: true, force: true });
fs.cpSync("public", "dist", { recursive: true, filter: (src) => !src.endsWith("sw.js") });
fs.writeFileSync(
  path.join("dist", "config.js"),
  `window.YUMETAN_CONFIG = ${JSON.stringify({ apiBase: apiUrl, revenueCat }, null, 2)};\n`,
);
console.log(`dist/ を作成しました（接続先: ${apiUrl}）`);
if (testStore)
  console.warn(
    "注意: RevenueCat は Test Store キーです。ストア公開ビルドでは REVENUECAT_IOS_API_KEY / REVENUECAT_ANDROID_API_KEY を指定してください。",
  );
