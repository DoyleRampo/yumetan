// ネイティブアプリ用に public/ を dist/ にコピーし、接続先サーバーURLとRevenueCatの公開キーを埋め込む
// 使い方: API_URL=https://your-server.example.com REVENUECAT_IOS_KEY=appl_... REVENUECAT_ANDROID_KEY=goog_... node scripts/build-mobile.mjs
// RevenueCatの公開SDKキー（appl_/goog_）はアプリに埋め込んでよい値。秘密キー（sk_）は絶対に渡さないこと。
// Test Store用キー（test_）はDebugビルド専用。TestFlight / App Store（Release）で使うとSDKが
// 「Wrong API Key」を表示してアプリを終了させるため、REVENUECAT_ALLOW_TEST_STORE=1 を付けた
// 開発ビルドでしか受け付けない。
import fs from "node:fs";
import path from "node:path";

const apiUrl = (process.env.API_URL || "").replace(/\/$/, "");
if (!apiUrl) {
  console.error(
    "API_URL（公開したサーバーのURL）を指定してください。例: API_URL=https://yumetan.onrender.com npm run mobile:build",
  );
  process.exit(1);
}
fs.rmSync("dist", { recursive: true, force: true });
fs.cpSync("public", "dist", {
  recursive: true,
  filter: (src) => !src.endsWith("sw.js"),
});
const allowTestStore = process.env.REVENUECAT_ALLOW_TEST_STORE === "1";
const revenueCat = {
  ios: process.env.REVENUECAT_IOS_KEY || "",
  android: process.env.REVENUECAT_ANDROID_KEY || "",
  ...(allowTestStore ? { allowTestStore: true } : {}),
};
for (const [platform, key] of [
  ["ios", revenueCat.ios],
  ["android", revenueCat.android],
]) {
  if (key.startsWith("sk_")) {
    console.error(
      `REVENUECAT_${platform.toUpperCase()}_KEY に秘密キー（sk_）が指定されています。公開SDKキーを使ってください。`,
    );
    process.exit(1);
  }
  if (key.startsWith("test_") && !allowTestStore) {
    console.error(
      `REVENUECAT_${platform.toUpperCase()}_KEY に Test Store 用キー（test_）が指定されています。TestFlight / ストア配布ではSDKが「Wrong API Key」を表示してアプリを終了させるため、公開SDKキー（${platform === "ios" ? "appl_" : "goog_"}…）を使ってください。シミュレータ等のDebugビルドで Test Store を使う場合だけ REVENUECAT_ALLOW_TEST_STORE=1 を付けてください。`,
    );
    process.exit(1);
  }
  if (key.startsWith("test_"))
    console.warn(
      `REVENUECAT_${platform.toUpperCase()}_KEY は Test Store 用キーです。このビルドをTestFlight / ストアへ配布しないでください。`,
    );
  if (!key)
    console.warn(
      `REVENUECAT_${platform.toUpperCase()}_KEY 未設定: ${platform} ではストア購入ボタンが無効になります。`,
    );
}
// LINE Login channel ID (public). With it the iOS app logs in through the LINE app;
// without it LINE falls back to the browser flow (Identity Platform OIDC).
const lineChannelId = String(process.env.LINE_CHANNEL_ID || "").trim();
if (!lineChannelId)
  console.warn(
    "LINE_CHANNEL_ID 未設定: LINE ログインはブラウザ経由（Identity Platform）になります。",
  );
// Google iOS OAuth client ID (public). With it the iOS app signs in through the
// Google Sign-In sheet; without it Google falls back to the browser flow.
const googleIosClientId = String(process.env.GOOGLE_IOS_CLIENT_ID || "").trim();
if (!googleIosClientId)
  console.warn(
    "GOOGLE_IOS_CLIENT_ID 未設定: iOS の Google ログインはブラウザ経由になります。",
  );
fs.writeFileSync(
  path.join("dist", "config.js"),
  `window.YUMETAN_CONFIG = ${JSON.stringify({ apiBase: apiUrl, revenueCat, lineChannelId, googleIosClientId })};\n`,
);
console.log(`dist/ を作成しました（接続先: ${apiUrl}）`);
